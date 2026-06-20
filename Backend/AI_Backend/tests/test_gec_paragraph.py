"""
Unit tests for Feedback_Model._gec_correct paragraph-preservation logic.

Key behaviour:
  - Newlines delimit paragraphs; they are preserved (re-joined with \\n\\n)
  - Empty string returns empty string
  - Single-paragraph text has no extra newlines added
"""

import re
import pytest


# ── Extract the pure paragraph logic from Feedback_Model ─────────────────────
# We test the logic directly without instantiating the full model.

def _gec_correct_stub(text: str, sentence_corrector=None) -> str:
    """
    Pure-Python replica of Feedback_Analyzer._gec_correct().
    Accepts an optional sentence_corrector callable for injection.
    """
    if sentence_corrector is None:
        sentence_corrector = lambda s: s  # identity — no real model

    paragraphs = [p.strip() for p in re.split(r'\n+', text) if p.strip()]
    if not paragraphs:
        return text
    corrected_paragraphs = []
    for para in paragraphs:
        sentences = re.split(r'(?<=[.!?])\s+', para)
        sentences = [s.strip() for s in sentences if s.strip()]
        corrected_paragraphs.append(
            ' '.join(sentence_corrector(s) for s in sentences) if sentences else para
        )
    return '\n\n'.join(corrected_paragraphs).strip()


# ── Tests ──────────────────────────────────────────────────────────────────────

class TestGecParagraphBreaks:
    def test_single_newline_becomes_double_newline(self):
        text = "First paragraph.\nSecond paragraph."
        result = _gec_correct_stub(text)
        assert '\n\n' in result

    def test_double_newline_preserved(self):
        text = "First paragraph.\n\nSecond paragraph."
        result = _gec_correct_stub(text)
        parts = [p for p in result.split('\n\n') if p.strip()]
        assert len(parts) == 2

    def test_three_paragraphs_preserved(self):
        text = "Para one.\n\nPara two.\n\nPara three."
        result = _gec_correct_stub(text)
        parts = [p for p in result.split('\n\n') if p.strip()]
        assert len(parts) == 3

    def test_paragraph_order_preserved(self):
        text = "Alpha paragraph.\n\nBeta paragraph.\n\nGamma paragraph."
        result = _gec_correct_stub(text)
        parts = [p.strip() for p in result.split('\n\n') if p.strip()]
        assert parts[0].startswith('Alpha')
        assert parts[1].startswith('Beta')
        assert parts[2].startswith('Gamma')

    def test_sentence_corrector_applied_per_sentence(self):
        """Verify the sentence corrector is called, not applied paragraph-wide."""
        calls = []
        def recording_corrector(s):
            calls.append(s)
            return s

        text = "Hello world. Goodbye world.\n\nAnother para."
        _gec_correct_stub(text, sentence_corrector=recording_corrector)
        # 3 sentences: 2 in para 1, 1 in para 2
        assert len(calls) == 3

    def test_single_paragraph_no_extra_newlines(self):
        text = "This is a single paragraph with no line breaks."
        result = _gec_correct_stub(text)
        assert '\n' not in result

    def test_mixed_whitespace_lines_ignored(self):
        """Lines that are only spaces/tabs are treated as empty (no paragraph)."""
        text = "Para one.\n   \n\nPara two."
        result = _gec_correct_stub(text)
        parts = [p.strip() for p in result.split('\n\n') if p.strip()]
        assert len(parts) == 2


class TestGecEmptyInput:
    def test_empty_string_returns_empty_string(self):
        result = _gec_correct_stub("")
        assert result == ""

    def test_whitespace_only_returns_input(self):
        # split('\n+') on "   " gives ["   "], strip() gives "" → no paragraphs
        result = _gec_correct_stub("   ")
        assert result == "   "

    def test_only_newlines_returns_input(self):
        result = _gec_correct_stub("\n\n\n")
        assert result == "\n\n\n"
