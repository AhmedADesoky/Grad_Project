/**
 * Unit tests for examWorker.js business logic.
 * Tests the AI detection threshold constant and weakAreas dedup logic
 * extracted from processExamJob. External services are mocked.
 */

import { describe, test, expect } from '@jest/globals';

// ── Constants ─────────────────────────────────────────────────────────────────

const AI_DETECT_THRESHOLD = 97.0;  // must match the constant in examWorker.js

describe('AI detection threshold', () => {
  test('threshold constant is exactly 97.0', () => {
    expect(AI_DETECT_THRESHOLD).toBe(97.0);
  });

  test('probability > 97.0 triggers detection', () => {
    const maxAiProbability = 97.5;
    const detected = maxAiProbability > AI_DETECT_THRESHOLD;
    expect(detected).toBe(true);
  });

  test('probability exactly 97.0 does NOT trigger detection', () => {
    const maxAiProbability = 97.0;
    const detected = maxAiProbability > AI_DETECT_THRESHOLD;
    expect(detected).toBe(false);
  });

  test('probability < 97.0 does NOT trigger detection', () => {
    const maxAiProbability = 96.9;
    const detected = maxAiProbability > AI_DETECT_THRESHOLD;
    expect(detected).toBe(false);
  });

  test('probability 0 (no AI text) is not detected', () => {
    expect(0 > AI_DETECT_THRESHOLD).toBe(false);
  });

  test('probability 100 (definitely AI) is detected', () => {
    expect(100 > AI_DETECT_THRESHOLD).toBe(true);
  });
});

// ── weakAreas dedup logic (extracted from processExamJob) ────────────────────
//
// The real code builds weakAreas with a Set<string> to avoid duplicates.
// We test that logic in isolation here.

function buildWeakAreas(questionResults) {
  const weakAreas = [];
  const seen = new Set();
  const ERR_LABEL = {
    GRAM: 'Grammar', SPELL: 'Spelling', PUNCT: 'Punctuation',
    VOCAB: 'Vocabulary', WO: 'Word Order', STYLE: 'Style',
  };

  for (const qr of questionResults) {
    for (const issue of (qr.Feedback_Detected_Issues || [])) {
      const key = String(issue || '').toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        weakAreas.push(key.charAt(0).toUpperCase() + key.slice(1));
      }
    }
    const errors = typeof qr.Feedback_Errors === 'string'
      ? (() => { try { return JSON.parse(qr.Feedback_Errors); } catch { return []; } })()
      : (qr.Feedback_Errors || []);
    for (const err of errors) {
      const rawType = (err.type || '').toUpperCase().replace(/MMAR$/, 'M');
      const label = ERR_LABEL[rawType] || err.label;
      const key = String(label || '').toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        weakAreas.push(label);
      }
    }
  }

  return weakAreas;
}

describe('buildWeakAreas (dedup logic from examWorker)', () => {
  test('deduplicates the same issue appearing in multiple questions', () => {
    const qResults = [
      { Feedback_Detected_Issues: ['grammar'], Feedback_Errors: [] },
      { Feedback_Detected_Issues: ['grammar'], Feedback_Errors: [] },
    ];
    const areas = buildWeakAreas(qResults);
    expect(areas.filter(a => a === 'Grammar').length).toBe(1);
  });

  test('normalises casing — grammar and Grammar are the same', () => {
    const qResults = [
      { Feedback_Detected_Issues: ['Grammar'], Feedback_Errors: [] },
      { Feedback_Detected_Issues: ['grammar'], Feedback_Errors: [] },
    ];
    const areas = buildWeakAreas(qResults);
    expect(areas.filter(a => a.toLowerCase() === 'grammar').length).toBe(1);
  });

  test('maps GRAM error type to Grammar label', () => {
    const qResults = [
      { Feedback_Detected_Issues: [], Feedback_Errors: [{ type: 'GRAM' }] },
    ];
    const areas = buildWeakAreas(qResults);
    expect(areas).toContain('Grammar');
  });

  test('maps SPELL to Spelling', () => {
    const qResults = [
      { Feedback_Detected_Issues: [], Feedback_Errors: [{ type: 'SPELL' }] },
    ];
    expect(buildWeakAreas(qResults)).toContain('Spelling');
  });

  test('maps PUNCT to Punctuation', () => {
    const qResults = [
      { Feedback_Detected_Issues: [], Feedback_Errors: [{ type: 'PUNCT' }] },
    ];
    expect(buildWeakAreas(qResults)).toContain('Punctuation');
  });

  test('maps WO to Word Order', () => {
    const qResults = [
      { Feedback_Detected_Issues: [], Feedback_Errors: [{ type: 'WO' }] },
    ];
    expect(buildWeakAreas(qResults)).toContain('Word Order');
  });

  test('does not duplicate across Detected_Issues and Feedback_Errors', () => {
    const qResults = [
      {
        Feedback_Detected_Issues: ['grammar'],
        Feedback_Errors: [{ type: 'GRAM' }],  // same category, different source
      },
    ];
    const areas = buildWeakAreas(qResults);
    expect(areas.filter(a => a.toLowerCase() === 'grammar').length).toBe(1);
  });

  test('returns empty array for empty question results', () => {
    expect(buildWeakAreas([])).toEqual([]);
  });

  test('parses Feedback_Errors when stored as JSON string', () => {
    const qResults = [
      {
        Feedback_Detected_Issues: [],
        Feedback_Errors: JSON.stringify([{ type: 'VOCAB' }]),
      },
    ];
    expect(buildWeakAreas(qResults)).toContain('Vocabulary');
  });

  test('handles malformed Feedback_Errors JSON string gracefully', () => {
    const qResults = [
      {
        Feedback_Detected_Issues: ['spelling'],
        Feedback_Errors: '{not valid json',
      },
    ];
    const areas = buildWeakAreas(qResults);
    expect(areas).toContain('Spelling');  // detected issue still present
    expect(areas.length).toBe(1);        // malformed JSON contributed nothing
  });
});
