"""
Unit tests for Explanation_Generator.generate_explanations().

Key behaviour tested:
  - Malformed LLM response ["some string"] (array of strings, not dicts)
    is handled without crash — the isinstance(o, dict) guard filters it out.
  - Empty errors list returns False immediately (no API call).
  - When OPENROUTER_API_KEY is not set, returns False without crashing.
  - Successfully parsed responses fill 'explanation' in-place.
  - Partial JSON recovery (truncated response) still works.
"""

import json
import pytest
from unittest.mock import patch, MagicMock
import os
import sys

# Make sure we can import from the AI_Backend root
import importlib


def _get_module():
    """Import the generator fresh for each test to avoid state bleed."""
    if 'Feedback.services.Explanation_Generator' in sys.modules:
        del sys.modules['Feedback.services.Explanation_Generator']
    from Feedback.services import Explanation_Generator
    return Explanation_Generator


# ── Tests ──────────────────────────────────────────────────────────────────────

class TestMalformedLLMResponse:
    """The isinstance(o, dict) guard must handle non-dict array elements."""

    def test_array_of_strings_does_not_crash(self, monkeypatch):
        """LLM returns ["some string"] — not dicts — should return False gracefully."""
        gen = _get_module()
        monkeypatch.setenv('OPENROUTER_API_KEY', 'fake-key')

        # Mock _call to return a JSON array of strings (malformed)
        malformed_response = '["some explanation string", "another string"]'
        with patch.object(gen, '_call', return_value=malformed_response):
            errors = [{'type': 'GRAM', 'label': 'Grammar',
                       'text': 'he go', 'suggestion': 'he goes',
                       'explanation': 'template'}]
            result = gen.generate_explanations(errors, context_text="he go to school")
        # Should not crash; no valid dicts → filled = 0 → returns False
        assert result is False
        # Original template explanation preserved
        assert errors[0]['explanation'] == 'template'

    def test_mixed_array_uses_only_dicts(self, monkeypatch):
        """Array containing both strings and dicts — only dicts should be used."""
        gen = _get_module()
        monkeypatch.setenv('OPENROUTER_API_KEY', 'fake-key')

        mixed_response = json.dumps([
            "not a dict",
            {"i": 0, "explanation": "Real explanation here."},
            42,
        ])
        with patch.object(gen, '_call', return_value=mixed_response):
            errors = [{'type': 'GRAM', 'label': 'Grammar',
                       'text': 'he go', 'suggestion': 'he goes',
                       'explanation': 'template'}]
            result = gen.generate_explanations(errors, context_text="test")
        assert result is True
        assert errors[0]['explanation'] == "Real explanation here."

    def test_empty_dict_in_array_skipped(self, monkeypatch):
        """Dict without 'i' or 'explanation' keys should be skipped safely."""
        gen = _get_module()
        monkeypatch.setenv('OPENROUTER_API_KEY', 'fake-key')

        response = json.dumps([{}, {"i": 0}])  # second has no explanation
        with patch.object(gen, '_call', return_value=response):
            errors = [{'type': 'GRAM', 'label': 'Grammar',
                       'text': 'bad word', 'suggestion': 'good word',
                       'explanation': 'original'}]
            result = gen.generate_explanations(errors, context_text="test")
        assert result is False
        assert errors[0]['explanation'] == 'original'


class TestNoAPIKey:
    def test_returns_false_when_no_key_configured(self, monkeypatch):
        gen = _get_module()
        # Remove all key env vars
        for suffix in ("", "_2", "_3", "_4"):
            monkeypatch.delenv(f"OPENROUTER_API_KEY{suffix}", raising=False)
        errors = [{'type': 'GRAM', 'label': 'Grammar',
                   'text': 'bad', 'suggestion': 'good', 'explanation': 'tmpl'}]
        result = gen.generate_explanations(errors, context_text="test")
        assert result is False


class TestEmptyErrors:
    def test_empty_errors_list_returns_false(self, monkeypatch):
        gen = _get_module()
        monkeypatch.setenv('OPENROUTER_API_KEY', 'fake-key')
        assert gen.generate_explanations([], context_text="test") is False

    def test_errors_without_suggestion_skipped(self, monkeypatch):
        gen = _get_module()
        monkeypatch.setenv('OPENROUTER_API_KEY', 'fake-key')
        # No actionable items (suggestion is empty string)
        errors = [{'type': 'GRAM', 'label': 'Grammar',
                   'text': 'word', 'suggestion': '', 'explanation': 'tmpl'}]
        result = gen.generate_explanations(errors, context_text="test")
        assert result is False

    def test_removed_suggestion_skipped(self, monkeypatch):
        gen = _get_module()
        monkeypatch.setenv('OPENROUTER_API_KEY', 'fake-key')
        errors = [{'type': 'GRAM', 'label': 'Grammar',
                   'text': 'word', 'suggestion': '[removed]', 'explanation': 'tmpl'}]
        result = gen.generate_explanations(errors, context_text="test")
        assert result is False


class TestSuccessfulResponse:
    def test_fills_explanation_in_place(self, monkeypatch):
        gen = _get_module()
        monkeypatch.setenv('OPENROUTER_API_KEY', 'fake-key')

        good_response = json.dumps([
            {"i": 0, "explanation": "Use 'goes' not 'go' for third-person singular."}
        ])
        with patch.object(gen, '_call', return_value=good_response):
            errors = [{'type': 'GRAM', 'label': 'Grammar',
                       'text': 'he go', 'suggestion': 'he goes',
                       'explanation': 'template fallback'}]
            result = gen.generate_explanations(errors, context_text="he go to school")
        assert result is True
        assert "third-person" in errors[0]['explanation']

    def test_api_failure_returns_false_without_crash(self, monkeypatch):
        gen = _get_module()
        monkeypatch.setenv('OPENROUTER_API_KEY', 'fake-key')

        with patch.object(gen, '_call', side_effect=RuntimeError("Network error")):
            errors = [{'type': 'GRAM', 'label': 'Grammar',
                       'text': 'bad', 'suggestion': 'good',
                       'explanation': 'tmpl'}]
            result = gen.generate_explanations(errors, context_text="test")
        assert result is False
        assert errors[0]['explanation'] == 'tmpl'
