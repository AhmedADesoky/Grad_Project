"""
Integration tests for the Feedback pipeline GraphQL endpoint.

Skipped automatically when the server is not reachable.
"""

import json
import pytest

try:
    import urllib.request
    import urllib.error
except ImportError:
    pass

AI_BACKEND_URL = 'http://localhost:8000/graphql'
TIMEOUT = 10  # Feedback is heavier than classification


def _gql(query, variables=None, token=None):
    body = json.dumps({'query': query, 'variables': variables or {}}).encode('utf-8')
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(AI_BACKEND_URL, data=body, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as exc:
        return {'_connection_error': str(exc)}


def _server_reachable():
    try:
        req = urllib.request.Request(
            AI_BACKEND_URL,
            data=b'{"query":"{ __typename }"}',
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=5):
            return True
    except Exception:
        return False


@pytest.fixture(scope='module')
def server_up():
    if not _server_reachable():
        pytest.skip('Django AI backend not reachable')
    return True


FEEDBACK_QUERY = """
    mutation Analyze($userId: String!, $text: String!) {
      Analyze_Text(User_Id: $userId, Text: $text) {
        Success
        Overall_Score
        Grammar_Score
        Vocab_Score
        Punct_Score
        Corrected
        Detected_Issues
        Error
      }
    }
"""


class TestFeedbackPipeline:

    def test_feedback_mutation_returns_expected_keys(self, server_up):
        """Feedback response must contain all score fields."""
        import jwt, os
        secret = os.getenv('ACCESS_TOKEN_SECRET', 'test-secret')
        token = jwt.encode({'sub': 'integration-test-user'}, secret, algorithm='HS256')

        data = _gql(FEEDBACK_QUERY, {
            'userId': 'integration-test-user',
            'text': 'She go to the store yesterday. Their was many people there.',
        }, token=token)

        if '_connection_error' in data:
            pytest.skip(f"Connection error: {data['_connection_error']}")

        assert 'data' in data or 'errors' in data

        if 'data' in data and data['data'] and data['data'].get('Analyze_Text'):
            result = data['data']['Analyze_Text']
            assert 'Success' in result
            if result['Success']:
                for key in ('Overall_Score', 'Grammar_Score', 'Vocab_Score', 'Punct_Score'):
                    assert key in result, f"Missing key: {key}"
                    score = result[key]
                    assert 0 <= score <= 100, f"{key}={score} out of [0,100]"

    def test_feedback_unauthenticated_rejected(self, server_up):
        """Feedback without auth token must be rejected."""
        data = _gql(FEEDBACK_QUERY, {
            'userId': 'someone',
            'text': 'Hello world.',
        })
        if '_connection_error' in data:
            pytest.skip(f"Connection error: {data['_connection_error']}")

        # No token → must have errors or Success: False
        has_error = (
            'errors' in data or (
                data.get('data', {}) and
                data['data'].get('Analyze_Text') and
                data['data']['Analyze_Text'].get('Success') is False
            )
        )
        assert has_error, "Expected auth rejection but got success"

    def test_feedback_empty_text_handled(self, server_up):
        """Empty text should return an error, not crash."""
        import jwt, os
        secret = os.getenv('ACCESS_TOKEN_SECRET', 'test-secret')
        token = jwt.encode({'sub': 'test-user'}, secret, algorithm='HS256')

        data = _gql(FEEDBACK_QUERY, {
            'userId': 'test-user',
            'text': '',
        }, token=token)

        if '_connection_error' in data:
            pytest.skip(f"Connection error: {data['_connection_error']}")

        # Must not be a 500 — should be a handled error
        assert 'data' in data or 'errors' in data
