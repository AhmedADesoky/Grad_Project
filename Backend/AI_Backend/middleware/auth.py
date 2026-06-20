import os
import time
import threading
from functools import wraps

import jwt

# Same secret the Node User Backend uses to sign access tokens.
# Must match ACCESS_TOKEN_SECRET in Backend/User_Backend/.env
_SECRET = os.getenv('ACCESS_TOKEN_SECRET', '')
_ALGORITHM = 'HS256'


def _extract_token(info) -> str | None:
    """Pull the Bearer token from the GraphQL request context."""
    meta = getattr(info.context, 'META', {})
    auth_header = meta.get('HTTP_AUTHORIZATION', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:]
    return None


def _verify_token(token: str) -> dict:
    """
    Decode and verify the JWT. Raises a plain Exception with a safe message
    so Graphene surfaces it as a GraphQL error (not a 500).
    """
    if not _SECRET:
        raise Exception('Server misconfiguration: ACCESS_TOKEN_SECRET not set.')
    try:
        payload = jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise Exception('Token expired. Please log in again.')
    except jwt.InvalidTokenError:
        raise Exception('Invalid token.')


def require_auth(fn):
    """
    Decorator for Graphene mutation/query resolvers that:
      1. Requires a valid Bearer JWT in the Authorization header.
      2. Rejects requests where the JWT subject (userId) does not match the
         User_Id argument — prevents user A from touching user B's data.
      3. Attaches info.context.user_id so the resolver can use it.

    Usage:
        class My_Mutation(Mutation):
            @require_auth
            def mutate(self, info, User_Id, ...):
                ...
    """
    @wraps(fn)
    def wrapper(root, info, *args, **kwargs):
        token = _extract_token(info)
        if not token:
            raise Exception('Authentication required.')

        payload = _verify_token(token)

        # JWT stores the user id in the `sub` claim (see User Backend token.js)
        token_user_id = str(payload.get('sub', ''))
        if not token_user_id:
            raise Exception('Invalid token: missing subject.')

        # If the caller passes a User_Id, it must match the token owner.
        # This stops user A from passing user B's ID to read/mutate their data.
        claimed_user_id = kwargs.get('User_Id') or (args[0] if args else None)
        if claimed_user_id and str(claimed_user_id) != token_user_id:
            raise Exception('Forbidden: you can only access your own data.')

        # Make the verified user id available to the resolver
        info.context.user_id = token_user_id

        return fn(root, info, *args, **kwargs)

    return wrapper


# ─── Rate limiter ─────────────────────────────────────────────────────────────
# In-process sliding-window counter. No Redis dependency — works for a single
# Django process (dev + small prod). Replace with Django cache backend for
# multi-process deployments.

_rate_store: dict[str, list[float]] = {}
_rate_lock = threading.Lock()
_rate_last_evict = time.monotonic()
_EVICT_INTERVAL = 600  # purge stale keys every 10 minutes


def rate_limit(max_calls: int, window_seconds: int):
    """
    Decorator that limits how many times a user can call a resolver within a
    rolling time window.

    Usage:
        class Generate_Plan_Mutation(Mutation):
            @require_auth                        # always pair with require_auth
            @rate_limit(max_calls=5, window_seconds=3600)
            def mutate(self, info, User_Id, ...):
                ...

    The user key is taken from info.context.user_id (set by require_auth).
    Falls back to the User_Id kwarg if require_auth hasn't run yet.
    """
    def decorator(fn):
        action = fn.__qualname__   # e.g. "Generate_Plan_Mutation.mutate"

        @wraps(fn)
        def wrapper(root, info, *args, **kwargs):
            user_id = getattr(info.context, 'user_id', None) \
                      or kwargs.get('User_Id', 'anonymous')
            key = f"{action}:{user_id}"
            now = time.monotonic()
            cutoff = now - window_seconds

            with _rate_lock:
                global _rate_last_evict
                if now - _rate_last_evict > _EVICT_INTERVAL:
                    stale = [k for k, v in _rate_store.items()
                             if not any(t > now - window_seconds for t in v)]
                    for k in stale:
                        del _rate_store[k]
                    _rate_last_evict = now

                timestamps = _rate_store.get(key, [])
                # Drop calls outside the rolling window
                timestamps = [t for t in timestamps if t > cutoff]
                if len(timestamps) >= max_calls:
                    wait = int(window_seconds - (now - timestamps[0]))
                    raise Exception(
                        f"Rate limit exceeded. You can call this {max_calls} times "
                        f"per {window_seconds // 60} minute(s). "
                        f"Try again in {wait}s."
                    )
                # Don't record the attempt yet — only count on success
                _rate_store[key] = timestamps

            result = fn(root, info, *args, **kwargs)

            # Count the trial only when the call succeeds
            success = getattr(result, 'Success', None)
            if success is None or success:
                with _rate_lock:
                    timestamps = _rate_store.get(key, [])
                    timestamps = [t for t in timestamps if t > cutoff]
                    timestamps.append(now)
                    _rate_store[key] = timestamps

            return result

        return wrapper
    return decorator
