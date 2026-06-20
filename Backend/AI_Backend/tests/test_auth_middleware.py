"""
Unit tests for middleware/auth.py

Tests:
  - @require_auth rejects missing token
  - @require_auth rejects expired token
  - @require_auth rejects token with wrong User_Id
  - @require_auth accepts valid token
  - rate_limit decorator raises after max_calls exceeded
  - rate_limit does not raise before limit
"""

import time
import pytest
import jwt
import os

# Set secret before importing middleware
os.environ.setdefault('ACCESS_TOKEN_SECRET', 'test-secret-for-unit-tests')

from middleware.auth import require_auth, rate_limit, _rate_store

_SECRET = os.environ['ACCESS_TOKEN_SECRET']


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_info(token=None, user_id_attr=None):
    """Fake Graphene 'info' object with a context that has META."""
    class FakeMeta:
        pass

    class FakeContext:
        META = {}
        user_id = user_id_attr

    ctx = FakeContext()
    if token:
        ctx.META = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

    class FakeInfo:
        context = ctx

    return FakeInfo()


def _make_valid_token(user_id='user-abc', expires_in=300):
    return jwt.encode({'sub': user_id}, _SECRET, algorithm='HS256')


def _make_expired_token(user_id='user-abc'):
    return jwt.encode({'sub': user_id, 'exp': 1}, _SECRET, algorithm='HS256')


# ── require_auth ──────────────────────────────────────────────────────────────

class TestRequireAuth:

    def test_raises_when_no_token(self):
        @require_auth
        def mock_mutate(root, info, **kwargs):
            return 'ok'

        info = _make_info(token=None)
        with pytest.raises(Exception, match='Authentication required'):
            mock_mutate(None, info)

    def test_raises_for_expired_token(self):
        @require_auth
        def mock_mutate(root, info, **kwargs):
            return 'ok'

        token = _make_expired_token()
        info = _make_info(token=token)
        with pytest.raises(Exception, match='[Tt]oken expired|[Ii]nvalid'):
            mock_mutate(None, info)

    def test_raises_for_wrong_user_id(self):
        @require_auth
        def mock_mutate(root, info, User_Id=None, **kwargs):
            return 'ok'

        token = _make_valid_token('real-user')
        info = _make_info(token=token)
        with pytest.raises(Exception, match='[Ff]orbidden'):
            mock_mutate(None, info, User_Id='different-user')

    def test_passes_with_valid_token_and_matching_user_id(self):
        @require_auth
        def mock_mutate(root, info, User_Id=None, **kwargs):
            return 'success'

        token = _make_valid_token('user-123')
        info = _make_info(token=token)
        result = mock_mutate(None, info, User_Id='user-123')
        assert result == 'success'

    def test_passes_with_valid_token_and_no_user_id_arg(self):
        @require_auth
        def mock_mutate(root, info, **kwargs):
            return 'no-id-ok'

        token = _make_valid_token('user-xyz')
        info = _make_info(token=token)
        result = mock_mutate(None, info)
        assert result == 'no-id-ok'

    def test_sets_user_id_on_context(self):
        @require_auth
        def mock_mutate(root, info, **kwargs):
            return info.context.user_id

        token = _make_valid_token('user-777')
        info = _make_info(token=token)
        result = mock_mutate(None, info)
        assert result == 'user-777'

    def test_raises_for_malformed_token(self):
        @require_auth
        def mock_mutate(root, info, **kwargs):
            return 'ok'

        info = _make_info(token='not.a.real.jwt')
        with pytest.raises(Exception, match='[Ii]nvalid'):
            mock_mutate(None, info)

    def test_raises_for_token_signed_with_wrong_secret(self):
        @require_auth
        def mock_mutate(root, info, **kwargs):
            return 'ok'

        bad_token = jwt.encode({'sub': 'user'}, 'wrong-secret', algorithm='HS256')
        info = _make_info(token=bad_token)
        with pytest.raises(Exception, match='[Ii]nvalid'):
            mock_mutate(None, info)


# ── rate_limit ────────────────────────────────────────────────────────────────

class TestRateLimit:

    def setup_method(self):
        # Clear rate store before each test
        _rate_store.clear()

    def test_does_not_raise_under_limit(self):
        @rate_limit(max_calls=3, window_seconds=60)
        def action(root, info, **kwargs):
            return MagicResult(success=True)

        token = _make_valid_token('rate-user')
        # Call twice — should not raise
        for _ in range(2):
            info = _make_info(token=token)
            info.context.user_id = 'rate-user'
            action(None, info)  # no exception

    def test_raises_after_exceeding_limit(self):
        @rate_limit(max_calls=2, window_seconds=60)
        def action(root, info, **kwargs):
            return MagicResult(success=True)

        for _ in range(2):
            info = _make_info(token=_make_valid_token('rl-user'))
            info.context.user_id = 'rl-user'
            action(None, info)

        # Third call should be blocked
        info = _make_info(token=_make_valid_token('rl-user'))
        info.context.user_id = 'rl-user'
        with pytest.raises(Exception, match='[Rr]ate limit'):
            action(None, info)

    def test_different_users_have_separate_counters(self):
        @rate_limit(max_calls=1, window_seconds=60)
        def action(root, info, **kwargs):
            return MagicResult(success=True)

        for user_id in ('user-A', 'user-B'):
            info = _make_info(token=_make_valid_token(user_id))
            info.context.user_id = user_id
            action(None, info)  # each user makes 1 call — within limit


class MagicResult:
    """Minimal result object with a Success attribute for rate_limit counting."""
    def __init__(self, success=True):
        self.Success = success
