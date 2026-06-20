"""
Unit tests for Feedback_Model.Analyze_Text scoring logic.

The real ML models (DeBERTa, T5) are mocked so these tests run
instantly without GPU or model weights.

What we test:
  - Return dict contains all required keys
  - Scores are in [0, 100] range
  - Empty input raises ValueError
  - Analyze_Batch handles individual item failures gracefully
"""

import pytest
from unittest.mock import MagicMock, patch
import sys
import types


# ── Patch heavy dependencies before importing Feedback_Model ─────────────────

def _make_torch_mock():
    """Return a minimal torch mock that satisfies Feedback_Model imports."""
    torch = MagicMock()
    # torch.device returns a simple object
    torch.device.return_value = MagicMock(spec=str)
    # Tensor operations
    mock_tensor = MagicMock()
    mock_tensor.size.return_value = 1
    mock_tensor.__getitem__ = MagicMock(return_value=mock_tensor)
    torch.no_grad.return_value.__enter__ = lambda s: None
    torch.no_grad.return_value.__exit__ = MagicMock(return_value=False)
    torch.zeros.return_value = mock_tensor
    torch.cat.return_value = mock_tensor
    torch.sigmoid.return_value = mock_tensor
    torch.load.return_value = {
        'span_head': MagicMock(),
        'score_head': MagicMock(),
        'pattern_head': MagicMock(),
    }
    torch.cuda.is_available.return_value = False
    # nn module
    nn = MagicMock()
    torch.nn = nn
    return torch


@pytest.fixture(autouse=True)
def mock_heavy_deps(monkeypatch):
    """Mock torch and transformers so model weights are never loaded."""
    torch_mock = _make_torch_mock()
    monkeypatch.setitem(sys.modules, 'torch', torch_mock)
    monkeypatch.setitem(sys.modules, 'torch.nn', torch_mock.nn)
    monkeypatch.setitem(sys.modules, 'transformers', MagicMock())
    monkeypatch.setitem(sys.modules, 'spellchecker', MagicMock())
    yield


def _make_analyzer():
    """Build a Feedback_Analyzer with all internal methods stubbed."""
    # Import after mocking to avoid torch errors
    from Feedback.services.Feedback_Model import Feedback_Analyzer

    analyzer = object.__new__(Feedback_Analyzer)
    analyzer.device = 'cpu'
    analyzer.spell = None

    # Stub ML inference methods
    analyzer._detect_error_spans = MagicMock(return_value=[])
    analyzer._severity_fluency = MagicMock(return_value=(0.1, 0.9))
    analyzer._profile_patterns = MagicMock(return_value=([], 'stable'))
    analyzer._gec_correct = MagicMock(side_effect=lambda text: text)
    analyzer._apply_gec_selectively = MagicMock(side_effect=lambda orig, corr, spans: corr)
    analyzer._spelling_filter = MagicMock(side_effect=lambda text: (text, []))
    analyzer._build_error_details = MagicMock(return_value=[])

    return analyzer


# ── Tests ──────────────────────────────────────────────────────────────────────

class TestAnalyzeTextKeys:
    """Analyze_Text must return a dict with all expected keys."""

    REQUIRED_KEYS = {
        'text', 'corrected', 'feedback_text',
        'overall_score', 'grammar_score', 'spelling_score',
        'vocab_score', 'punct_score',
        'severity', 'fluency',
        'detected_issues', 'errors', 'spelling_corrections',
        'recurring_patterns', 'dominant_error', 'error_trend',
        'correction_applied',
    }

    def test_all_required_keys_present(self):
        analyzer = _make_analyzer()
        result = analyzer.Analyze_Text("This is a test sentence.")
        missing = self.REQUIRED_KEYS - result.keys()
        assert not missing, f"Missing keys: {missing}"

    def test_result_is_dict(self):
        analyzer = _make_analyzer()
        result = analyzer.Analyze_Text("Hello world.")
        assert isinstance(result, dict)

    def test_text_key_is_input_stripped(self):
        analyzer = _make_analyzer()
        result = analyzer.Analyze_Text("  Hello world.  ")
        assert result['text'] == "Hello world."


class TestAnalyzeTextScores:
    """Scores must be numeric and in [0, 100]."""

    SCORE_KEYS = ['overall_score', 'grammar_score', 'spelling_score', 'vocab_score', 'punct_score']

    def test_scores_are_numeric(self):
        analyzer = _make_analyzer()
        result = analyzer.Analyze_Text("The quick brown fox.")
        for key in self.SCORE_KEYS:
            assert isinstance(result[key], (int, float)), f"{key} is not numeric"

    def test_scores_in_range_0_to_100(self):
        analyzer = _make_analyzer()
        result = analyzer.Analyze_Text("The quick brown fox.")
        for key in self.SCORE_KEYS:
            assert 0 <= result[key] <= 100, f"{key}={result[key]} out of [0, 100]"

    def test_overall_score_with_no_errors_is_high(self):
        """Zero errors + good severity/fluency → overall score near 100."""
        analyzer = _make_analyzer()
        analyzer._severity_fluency = MagicMock(return_value=(0.0, 1.0))  # perfect
        analyzer._build_error_details = MagicMock(return_value=[])
        result = analyzer.Analyze_Text("Perfect sentence.")
        assert result['overall_score'] >= 90


class TestAnalyzeTextEdgeCases:
    def test_empty_string_raises_value_error(self):
        analyzer = _make_analyzer()
        with pytest.raises(ValueError, match="empty"):
            analyzer.Analyze_Text("")

    def test_whitespace_only_raises_value_error(self):
        analyzer = _make_analyzer()
        with pytest.raises(ValueError):
            analyzer.Analyze_Text("   ")

    def test_single_word_text(self):
        analyzer = _make_analyzer()
        result = analyzer.Analyze_Text("Hello")
        assert result['text'] == 'Hello'

    def test_correction_applied_flag_false_when_no_change(self):
        analyzer = _make_analyzer()
        analyzer._gec_correct = MagicMock(side_effect=lambda t: t)
        analyzer._apply_gec_selectively = MagicMock(side_effect=lambda o, c, s: c)
        analyzer._spelling_filter = MagicMock(side_effect=lambda t: (t, []))
        result = analyzer.Analyze_Text("Unchanged text here.")
        assert result['correction_applied'] is False


class TestAnalyzeBatch:
    def test_batch_returns_list(self):
        analyzer = _make_analyzer()
        results = analyzer.Analyze_Batch(["Hello world.", "Another sentence."])
        assert isinstance(results, list)
        assert len(results) == 2

    def test_batch_handles_empty_text_gracefully(self):
        analyzer = _make_analyzer()
        results = analyzer.Analyze_Batch(["Valid text.", ""])
        # Second item fails (ValueError) and should return an error dict
        assert 'error' in results[1]
        assert results[0].get('text') == 'Valid text.'

    def test_batch_empty_list(self):
        analyzer = _make_analyzer()
        assert analyzer.Analyze_Batch([]) == []
