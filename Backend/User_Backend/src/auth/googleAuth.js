import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { randomUUID } from 'crypto';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import RefreshToken from '../models/Refreshtoken.js';

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL,
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRES_IN = '15m',
  REFRESH_TOKEN_EXPIRES_IN = '7d',
  REFRESH_TOKEN_TTL_DAYS = '7',
} = process.env;

function hashToken(t) {
  return crypto.createHash('sha256').update(t).digest('hex');
}

function getRefreshExpiry() {
  const days = Number(REFRESH_TOKEN_TTL_DAYS);
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function makeTokens(userId) {
  const accessToken = jwt.sign({ sub: userId }, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
  const jti = randomUUID();
  const refreshToken = jwt.sign({ sub: userId, jti }, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
  return { accessToken, refreshToken, jti };
}

passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email) return done(new Error('No email returned from Google'));

        let user = await User.findOne({ Google_Id: profile.id });

        if (!user) {
          // Link to existing account by email, or create new one
          user = await User.findOne({ Email: email });
          if (user) {
            user.Google_Id = profile.id;
            user.Auth_Provider = 'google';
            if (!user.Profile_Image && profile.photos?.[0]?.value) {
              user.Profile_Image = profile.photos[0].value;
            }
            user.Is_Verified = true;
            await user.save();
          } else {
            const baseName = profile.displayName?.replace(/\s+/g, '_') || email.split('@')[0];
            let userName = baseName;
            let suffix = 1;
            while (await User.exists({ User_Name: userName })) {
              userName = `${baseName}_${suffix++}`;
            }
            user = await User.create({
              Google_Id: profile.id,
              Auth_Provider: 'google',
              User_Name: userName,
              Email: email,
              Password: randomUUID(), // placeholder — will never be used
              Profile_Image: profile.photos?.[0]?.value || null,
              Is_Verified: true,
            });
          }
        }

        const { accessToken, refreshToken, jti } = makeTokens(user._id.toString());

        await RefreshToken.create({
          User_Id: user._id,
          Jti: jti,
          Token_Hash: hashToken(refreshToken),
          Expires_At: getRefreshExpiry(),
          User_Agent: null,
          IP_Address: null,
          Revoked_At: null,
        });

        return done(null, { user, accessToken, refreshToken });
      } catch (err) {
        return done(err);
      }
    }
  )
);

export default passport;
