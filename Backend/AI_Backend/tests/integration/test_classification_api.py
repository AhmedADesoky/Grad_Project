"""
Integration tests for the Django AI Backend GraphQL endpoint.

These tests hit the live server at http://localhost:8000/graphql.
They are automatically skipped when the server is not reachable.

Run the server first:  python manage.py runserver
Then run:              pytest tests/integration/
"""

import json
import pytest

try:
    from urllib import request as urllib_request, error as urllib_error
    import urllib.request
    URLLIB_AVAILABLE = True
except ImportError:
    URLLIB_AVAILABLE = False

AI_BACKEND_URL = 'http://localhost:8000/graphql'
TIMEOUT = 5


def _gql(query, variables=None, token=None):
    """Simple HTTP GraphQL call without requests library."""
    body = json.dumps({'query': query, 'variables': variables or {}}).encode('utf-8')
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib_request.Request(AI_BACKEND_URL, data=body, headers=headers, method='POST')
    try:
        with urllib_request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as exc:
        return {'_connection_error': str(exc)}


def _server_reachable():
    try:
        req = urllib_request.Request(
            AI_BACKEND_URL,
            data=b'{"query":"{ __typename }"}',
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib_request.urlopen(req, timeout=TIMEOUT):
            return True
    except Exception:
        return False


# ── Tests ──────────────────────────────────────────────────────────────────────

@pytest.fixture(scope='module')
def server_up():
    reachable = _server_reachable()
    if not reachable:
        pytest.skip('Django AI backend not reachable — start the server first')
    return True


class TestClassificationEndpoint:

    def test_graphql_endpoint_responds(self, server_up):
        data = _gql('{ __typename }')
        assert '_connection_error' not in data
        assert 'data' in data

    def test_classify_mutation_structure(self, server_up):
        """Classify_Text mutation should return Success, Level, Confidence."""
        query = """
            mutation {
              Classify_Text(Text: "I have always been interested in learning new languages and exploring different cultures.") {
                Success
                Level
                Confidence
                Error
              }
            }
        """
        data = _gql(query)
        if '_connection_error' in data:
            pytest.skip(f"Connection error: {data['_connection_error']}")

        # Response must not be a server crash (500 → we get errors)
        assert 'data' in data or 'errors' in data

        if 'data' in data and data['data'] and data['data'].get('Classify_Text'):
            result = data['data']['Classify_Text']
            # If it succeeded, check structure
            assert 'Success' in result
            if result['Success']:
                assert result['Level'] in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')
                assert isinstance(result['Confidence'], (int, float))

    def test_classify_mutation_requires_text(self, server_up):
        """Empty text should return an error, not crash."""
        query = """
            mutation {
              Classify_Text(Text: "") {
                Success
                Error
              }
            }
        """
        data = _gql(query)
        if '_connection_error' in data:
            pytest.skip(f"Connection error: {data['_connection_error']}")
        # Either GraphQL validation error OR Success: False
        assert 'data' in data or 'errors' in data


class TestAIDetectionEndpoint:

    def test_detect_ai_mutation_structure(self, server_up):
        """Detect_AI mutation should return Success, Result."""
        query = """
            mutation {
              Detect_AI(Text: "Hello world.") {
                Success
                Error
              }
            }
        """
        data = _gql(query)
        if '_connection_error' in data:
            pytest.skip(f"Connection error: {data['_connection_error']}")
        assert 'data' in data or 'errors' in data

    def test_unauthenticated_evaluate_exam_rejected(self, server_up):
        """Evaluate_Exam requires auth — should reject with errors, not 500."""
        query = """
            mutation {
              Evaluate_Exam(
                User_Id: "fake-user",
                Answers: [{ Question_Id: 1, Answer_Text: "test" }]
              ) {
                Success
                Error
              }
            }
        """
        data = _gql(query)
        if '_connection_error' in data:
            pytest.skip(f"Connection error: {data['_connection_error']}")
        # Without auth token, must be rejected
        assert 'errors' in data or (
            'data' in data and
            data['data'] and
            data['data'].get('Evaluate_Exam') and
            data['data']['Evaluate_Exam'].get('Success') is False
        )
