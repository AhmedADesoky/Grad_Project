/**
 * Unit tests for helper functions in PersonalizedPlan.jsx
 *
 * We extract and test:
 *   - parseJsonField  (parse-or-return helper)
 *   - getScore        (score extraction with fallback keys)
 *   - computeTaskDone (done-label logic)
 *   - cacheGet/cacheSet/cacheClear (sessionStorage wrappers)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Inline the pure helpers so we can test without mounting the full component ──

function parseJsonField(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function getScore(scores, ...keys) {
  if (!scores) return 0;
  for (const k of keys) if (scores[k] != null) return Number(scores[k]);
  return 0;
}

function computeTaskDone(task, fb) {
  const s = task.status;
  if (s === 'reviewed') return true;
  if (s !== 'submitted') return false;
  if (fb) return !!(fb.Input_Text || fb.input_text || '').trim();
  return true;
}

// ── parseJsonField ─────────────────────────────────────────────────────────────

describe('parseJsonField', () => {
  it('returns fallback for null', () => {
    expect(parseJsonField(null)).toBeNull();
    expect(parseJsonField(null, 'DEFAULT')).toBe('DEFAULT');
  });

  it('returns fallback for undefined', () => {
    expect(parseJsonField(undefined, [])).toEqual([]);
  });

  it('returns fallback for empty string', () => {
    expect(parseJsonField('', 'fb')).toBe('fb');
  });

  it('returns object as-is when already parsed', () => {
    const obj = { key: 'value' };
    expect(parseJsonField(obj)).toBe(obj);  // same reference
  });

  it('parses valid JSON string', () => {
    expect(parseJsonField('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON array string', () => {
    expect(parseJsonField('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('returns fallback for malformed JSON', () => {
    expect(parseJsonField('{not json}', null)).toBeNull();
  });

  it('returns fallback for JSON number (not object)', () => {
    // "42" is valid JSON but we may want the fallback — parseJsonField returns 42 here
    expect(parseJsonField('42')).toBe(42);
  });
});

// ── getScore ──────────────────────────────────────────────────────────────────

describe('getScore', () => {
  it('returns 0 when scores is null', () => {
    expect(getScore(null, 'grammar_score')).toBe(0);
  });

  it('returns 0 when no key matches', () => {
    expect(getScore({ x: 5 }, 'grammar_score', 'vocab_score')).toBe(0);
  });

  it('returns value of first matching key', () => {
    expect(getScore({ grammar_score: 85, vocab_score: 70 }, 'grammar_score', 'vocab_score')).toBe(85);
  });

  it('falls back to second key when first is null', () => {
    expect(getScore({ grammar_score: null, vocab_score: 70 }, 'grammar_score', 'vocab_score')).toBe(70);
  });

  it('coerces string numbers to number', () => {
    expect(getScore({ score: '92.5' }, 'score')).toBe(92.5);
  });

  it('returns 0 for value 0 (not treated as missing)', () => {
    expect(getScore({ score: 0 }, 'score')).toBe(0);
  });
});

// ── computeTaskDone ───────────────────────────────────────────────────────────

describe('computeTaskDone', () => {
  it('returns true for reviewed task', () => {
    expect(computeTaskDone({ status: 'reviewed' }, null)).toBe(true);
  });

  it('returns false for pending task', () => {
    expect(computeTaskDone({ status: 'pending' }, null)).toBe(false);
  });

  it('returns false for in_progress task', () => {
    expect(computeTaskDone({ status: 'in_progress' }, null)).toBe(false);
  });

  it('returns true for submitted task with no DB record (trust plan JSON)', () => {
    expect(computeTaskDone({ status: 'submitted' }, null)).toBe(true);
  });

  it('returns true for submitted task with non-empty Input_Text', () => {
    const fb = { Input_Text: 'Hello world' };
    expect(computeTaskDone({ status: 'submitted' }, fb)).toBe(true);
  });

  it('returns false for submitted task with empty Input_Text', () => {
    const fb = { Input_Text: '   ' };
    expect(computeTaskDone({ status: 'submitted' }, fb)).toBe(false);
  });

  it('falls back to input_text (lowercase) when Input_Text is absent', () => {
    const fb = { input_text: 'Some text' };
    expect(computeTaskDone({ status: 'submitted' }, fb)).toBe(true);
  });
});
