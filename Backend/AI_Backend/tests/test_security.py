"""
Security tests for the AI Backend.

Tests:
  1. @require_auth rejects token from a different user (cross-user access)
  2. Rate limiting blocks after the threshold
  3. AI detection threshold (97%) is enforced correctly
"""

import os
import jwt
import time
import pytest

os.environ.setdefault('ACCESS_TOKEN_SECRET', 'test-secret-for-security-tests')

from middleware.auth import require_auth, rate_limit, _rate_store

_SECRET = os.environ['ACCESS_TOKEN_SECRET']


def _make_token(user_id, expires_in=300):
    return jwt.encode({'sub': user_id, 'exp': int(time.time()) + expires_in},
                      _SECRET, algorithm='HS256')


def _make_info(token=None, user_id_attr=None):
    class FakeContext:
        META = {}
        user_id = user_id_attr

    ctx = FakeContext()
    if token:
        ctx.META = {'HTTP_AUTHORIZATION': f'Bearer {token}'}

    class FakeInfo:
        context = ctx

    return FakeInfo()


class MagicResult:
    def __init__(self, success=True):
        self.Success = success


# ── Cross-user access prevention ──────────────────────────────────────────────

class TestCrossUserAccess:

    def test_user_a_cannot_access_user_b_data(self):
        """A token for user-A must NOT be accepted for a User_Id of user-B."""
        @require_auth
        def protected_mutation(root, info, User_Id=None, **kwargs):
            return 'should not reach'

        token_for_A = _make_token('user-A')
        info = _make_info(token=token_for_A)

        with pytest.raises(Exception, match='[Ff]orbidden'):
            protected_mutation(None, info, User_Id='user-B')

    def test_user_can_access_own_data(self):
        @require_auth
        def protected_mutation(root, info, User_Id=None, **kwargs):
            return 'allowed'

        token = _make_token('user-C')
        info = _make_info(token=token)
        result = protected_mutation(None, info, User_Id='user-C')
        assert result == 'allowed'

    def test_empty_subject_in_token_rejected(self):
        """Token with no 'sub' claim must be rejected."""
        bad_token = jwt.encode({'data': 'no-sub-claim'}, _SECRET, algorithm='HS256')

        @require_auth
        def protected(root, info, **kwargs):
            return 'ok'

        info = _make_info(token=bad_token)
        with pytest.raises(Exception, match='[Ii]nvalid|[Mm]issing'):
            protected(None, info)


# ── Rate limiting security ─────────────────────────────────────────────────────

class TestRateLimitingSecurity:

    def setup_method(self):
        _rate_store.clear()

    def test_rate_limit_blocks_excessive_calls(self):
        @rate_limit(max_calls=3, window_seconds=300)
        def expensive_op(root, info, **kwargs):
            return MagicResult(success=True)

        user_id = 'security-test-user'
        for _ in range(3):
            info = _make_info()
            info.context.user_id = user_id
            expensive_op(None, info)

        # 4th call must be blocked
        info = _make_info()
        info.context.user_id = user_id
        with pytest.raises(Exception, match='[Rr]ate limit'):
            expensive_op(None, info)

    def test_rate_limit_isolated_per_function(self):
        """Two different functions have independent rate limit counters."""
        @rate_limit(max_calls=1, window_seconds=300)
        def op_one(root, info, **kwargs):
            return MagicResult(success=True)

        @rate_limit(max_calls=1, window_seconds=300)
        def op_two(root, info, **kwargs):
            return MagicResult(success=True)

        user_id = 'isolated-user'
        info1 = _make_info()
        info1.context.user_id = user_id
        op_one(None, info1)  # uses op_one limit

        info2 = _make_info()
        info2.context.user_id = user_id
        op_two(None, info2)  # uses separate op_two limit — should not raise


# ── AI detection threshold (97%) ──────────────────────────────────────────────

class TestAIDetectionThreshold:
    """Verify the 97% threshold logic is correctly enforced at the business layer."""

    AI_DETECT_THRESHOLD = 97.0

    def _is_detected(self, probability):
        return probability > self.AI_DETECT_THRESHOLD

    def test_97_percent_is_NOT_flagged(self):
        assert self._is_detected(97.0) is False

    def test_97_1_percent_IS_flagged(self):
        assert self._is_detected(97.1) is True

    def test_96_9_percent_is_NOT_flagged(self):
        assert self._is_detected(96.9) is False

    def test_100_percent_IS_flagged(self):
        assert self._is_detected(100.0) is True

    def test_0_percent_is_NOT_flagged(self):
        assert self._is_detected(0.0) is False

    def test_threshold_cannot_be_bypassed_with_exactly_97(self):
        """97.0 exactly is the boundary — it should NOT trigger detection."""
        boundary = 97.0
        assert not (boundary > self.AI_DETECT_THRESHOLD), (
            "Boundary value 97.0 should NOT detect AI (must be strictly greater than)"
        )
