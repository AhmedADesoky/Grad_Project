/**
 * Unit tests for Node.js auth middleware (src/middleware/auth.js)
 * and JWT token utilities (src/utils/token.js).
 */

import jwt from 'jsonwebtoken';
import { describe, test, expect, beforeAll } from '@jest/globals';

// Set up secrets before any module import
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-for-unit-tests';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-for-unit-tests';

const { extractUser, requireAuth } = await import('../middleware/auth.js');
const { GenerateAccessToken, VerifyAccessToken } = await import('../utils/token.js');

// ── extractUser ───────────────────────────────────────────────────────────────

describe('extractUser', () => {
  test('returns null when no authorization header is present', () => {
    expect(extractUser({ headers: {} })).toBeNull();
  });

  test('returns null when authorization header is not Bearer', () => {
    expect(extractUser({ headers: { authorization: 'Basic abc' } })).toBeNull();
  });

  test('returns null for an invalid JWT', () => {
    expect(extractUser({ headers: { authorization: 'Bearer not.a.jwt' } })).toBeNull();
  });

  test('returns null for an expired JWT', () => {
    const expired = jwt.sign(
      { sub: 'user123' },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: -1 }  // already expired
    );
    expect(extractUser({ headers: { authorization: `Bearer ${expired}` } })).toBeNull();
  });

  test('returns decoded payload for a valid JWT', () => {
    const token = GenerateAccessToken('user-abc');
    const result = extractUser({ headers: { authorization: `Bearer ${token}` } });
    expect(result).not.toBeNull();
    expect(result.sub).toBe('user-abc');
  });

  test('returns null when req is null', () => {
    expect(extractUser(null)).toBeNull();
  });
});

// ── requireAuth ───────────────────────────────────────────────────────────────

describe('requireAuth', () => {
  const makeContext = (userId = null) => ({
    user: userId ? { sub: userId } : null,
  });

  test('throws "Authentication required." when no user in context', async () => {
    const resolver = requireAuth(async () => 'success');
    await expect(resolver(null, {}, makeContext(null), null))
      .rejects.toThrow('Authentication required.');
  });

  test('calls the wrapped resolver when token is valid', async () => {
    const resolver = requireAuth(async (_, args, ctx) => ({ userId: ctx.user.sub }));
    const result = await resolver(null, {}, makeContext('user-xyz'), null);
    expect(result.userId).toBe('user-xyz');
  });

  test('throws "Forbidden." when User_Id arg mismatches token userId', async () => {
    const resolver = requireAuth(async () => 'should not reach');
    await expect(
      resolver(null, { User_Id: 'other-user' }, makeContext('my-user'), null)
    ).rejects.toThrow('Forbidden.');
  });

  test('does NOT throw when User_Id arg matches token userId', async () => {
    const resolver = requireAuth(async () => 'ok');
    const result = await resolver(
      null,
      { User_Id: 'user-123' },
      makeContext('user-123'),
      null
    );
    expect(result).toBe('ok');
  });

  test('does NOT throw when no User_Id arg is present (auth-only routes)', async () => {
    const resolver = requireAuth(async () => 'no-id-arg-ok');
    const result = await resolver(null, {}, makeContext('user-456'), null);
    expect(result).toBe('no-id-arg-ok');
  });

  test('checks Id arg as fallback for User_Id', async () => {
    const resolver = requireAuth(async () => 'should not reach');
    await expect(
      resolver(null, { Id: 'wrong-user' }, makeContext('correct-user'), null)
    ).rejects.toThrow('Forbidden.');
  });
});

// ── VerifyAccessToken ─────────────────────────────────────────────────────────

describe('VerifyAccessToken', () => {
  test('verifies a freshly generated token', () => {
    const token = GenerateAccessToken('user-verify-test');
    const payload = VerifyAccessToken(token);
    expect(payload.sub).toBe('user-verify-test');
  });

  test('throws on an expired token', () => {
    const expired = jwt.sign(
      { sub: 'user123' },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: -1 }
    );
    expect(() => VerifyAccessToken(expired)).toThrow();
  });

  test('throws on a token signed with wrong secret', () => {
    const badToken = jwt.sign({ sub: 'user123' }, 'wrong-secret');
    expect(() => VerifyAccessToken(badToken)).toThrow();
  });
});
