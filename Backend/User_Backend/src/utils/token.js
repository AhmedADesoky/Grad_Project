import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;
const ACCESS_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

function EnsureSecrets() {
  if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
    throw new Error('Missing ACCESS_TOKEN_SECRET or REFRESH_TOKEN_SECRET');
  }
}

export function GenerateAccessToken(userId) {
  EnsureSecrets();
  return jwt.sign({ sub: userId }, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
}

export function GenerateRefreshToken(userId, jti) {
  EnsureSecrets();
  return jwt.sign({ sub: userId, jti }, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
}

export function VerifyAccessToken(token) {
  EnsureSecrets();
  return jwt.verify(token, ACCESS_TOKEN_SECRET);
}

export function VerifyRefreshToken(token) {
  EnsureSecrets();
  return jwt.verify(token, REFRESH_TOKEN_SECRET);
}

export function HashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function GetRefreshTokenExpiryDate() {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7);
  const now = new Date();
  now.setDate(now.getDate() + days);
  return now;
}