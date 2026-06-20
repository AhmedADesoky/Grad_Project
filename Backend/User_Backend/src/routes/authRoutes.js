import express from 'express';
import passport from '../auth/googleAuth.js';
import { mapUserToGraphQL } from '../services/userService.js';

const router = express.Router();

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'refresh_token';
const REFRESH_COOKIE_MAX_AGE_MS = Number(process.env.REFRESH_COOKIE_MAX_AGE_MS || 604800000);

// Step 1: redirect to Google
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

// Step 2: Google redirects back here
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_ORIGIN}/?error=oauth_failed` }),
  (req, res) => {
    const { user, accessToken, refreshToken } = req.user;

    // Set httpOnly refresh cookie (same as normal login)
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    });

    const mapped = mapUserToGraphQL(user, accessToken);

    // Pass user data as URL-safe base64 so the frontend can read it without an extra round-trip
    const payload = Buffer.from(JSON.stringify(mapped)).toString('base64url');
    res.redirect(`${FRONTEND_ORIGIN}/auth/callback?data=${payload}`);
  }
);

export default router;
