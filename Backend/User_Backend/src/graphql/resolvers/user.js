import User from '../../models/User.js';
import Classification_Level from '../../models/ClassificationLevel.js';
import {
  signUp,
  logIn,
  refreshAccessToken,
  logoutByRefreshToken,
  mapUserToGraphQL,
  updateProfile,
  addExamScore,
  changePassword,
  requestPasswordReset,
  resetPassword,
  verifyOTP,
  resendOTP,
  queueExamSubmission,
} from '../../services/userService.js';
import { requireAuth } from '../../middleware/auth.js';

const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'refresh_token';
const REFRESH_COOKIE_MAX_AGE_MS = Number(process.env.REFRESH_COOKIE_MAX_AGE_MS || 604800000);
const IS_PROD = process.env.NODE_ENV === 'production';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'none' : 'lax',
    path: '/graphql',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

export default {
  Query: {
    Users: requireAuth(async () => {
      const users = await User.find();
      return users.map((u) => mapUserToGraphQL(u, null));
    }),
    User: requireAuth(async (_, { Id }) => {
      const user = await User.findById(Id);
      if (!user) return null;
      return mapUserToGraphQL(user, null);
    }),
  },

  Mutation: {
    SignUp: async (_, { User_Name, Email, Password }) => {
      try {
        await signUp(User_Name, Email, Password);
      } catch (err) {
        if (err.message === 'UNVERIFIED_RESENT') {
          return { requiresVerification: true, email: Email.trim().toLowerCase(), message: 'A new verification code has been sent to your email.' };
        }
        throw err;
      }
      return { requiresVerification: true, email: Email.trim().toLowerCase(), message: 'Account created! Check your email for a 6-digit verification code.' };
    },

    Verify_OTP: async (_, { Email, OTP }, context) => {
      const auth = await verifyOTP(Email, OTP, {
        userAgent: context?.req?.headers?.['user-agent'],
        ipAddress: context?.req?.ip,
      });
      context?.res?.cookie(
        process.env.REFRESH_COOKIE_NAME || 'refresh_token',
        auth.refreshToken,
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          path: '/graphql',
          maxAge: Number(process.env.REFRESH_COOKIE_MAX_AGE_MS || 604800000),
        }
      );
      return auth.user;
    },

    Resend_OTP: async (_, { Email }) => {
      return resendOTP(Email);
    },

    Login: async (_, { Email, Password }, context) => {
      const auth = await logIn(Email, Password, {
        userAgent: context?.req?.headers?.['user-agent'],
        ipAddress: context?.req?.ip,
      });

      context?.res?.cookie(REFRESH_COOKIE_NAME, auth.refreshToken, refreshCookieOptions());
      return auth.user;
    },

    Refresh_Access_Token: async (_, __, context) => {
      const current = context?.req?.cookies?.[REFRESH_COOKIE_NAME];
      const auth = await refreshAccessToken(current, {
        userAgent: context?.req?.headers?.['user-agent'],
        ipAddress: context?.req?.ip,
      });

      context?.res?.cookie(REFRESH_COOKIE_NAME, auth.refreshToken, refreshCookieOptions());
      return auth.user;
    },

    // Logout only needs a valid refresh cookie — no access token required
    Logout: async (_, __, context) => {
      const current = context?.req?.cookies?.[REFRESH_COOKIE_NAME];
      await logoutByRefreshToken(current);
      context?.res?.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: 0 });
      return true;
    },

    Update_Profile: requireAuth(async (_, args, context) => {
      const updated = await updateProfile(args);
      return mapUserToGraphQL(updated, null);
    }),

    Submit_Exam: requireAuth(async (_, { User_Id, Attempt_Id, Answers }) => {
      return queueExamSubmission({ User_Id, Attempt_Id, Answers });
    }),

    Add_Exam_Score: requireAuth(async (_, args) => {
      const updated = await addExamScore(args);
      return mapUserToGraphQL(updated, null);
    }),

    Change_Password: requireAuth(async (_, args) => {
      return changePassword(args);
    }),

    Request_Password_Reset: async (_, { Email }) => {
      return requestPasswordReset(Email);
    },

    Reset_Password: async (_, { Token, New_Password }) => {
      return resetPassword(Token, New_Password);
    },
  },

  User: {
    Id: (user) => user.Id || (user._id ? user._id.toString() : null),
    User_Name: (user) => user.User_Name || user.username,
    Email: (user) => user.Email || user.email,
    Created_At: (user) =>
      user.Created_At ||
      user.createdAt ||
      (user.createdAt instanceof Date ? user.createdAt.toISOString() : null),
    Token: (user) => user.Token || user.token || null,

    id: (user) => user.id || user.Id || (user._id ? user._id.toString() : null),
    username: (user) => user.username || user.User_Name,
    email: (user) => user.email || user.Email,
    createdAt: (user) =>
      user.createdAt ||
      user.Created_At ||
      (user.createdAt instanceof Date ? user.createdAt.toISOString() : null),
    token: (user) => user.token || user.Token || null,
    profileImage: (user) => user.profileImage ?? user.Profile_Image ?? null,
    level: (user) => user.level || user.Level || 'A1',
    preferredPlanMode: (user) => user.preferredPlanMode || user.Preferred_Plan_Mode || 'weekly',
    progress: (user) =>
      user.progress || {
        completed: Number(user.Progress?.completed ?? 0),
        total: Number(user.Progress?.total ?? 10),
      },
    examScores: (user) =>
      user.examScores ||
      (Array.isArray(user.Exam_Scores)
        ? user.Exam_Scores.map((s) => ({
            date: new Date(s.date).toISOString(),
            score: Number(s.score),
            level: s.level,
          }))
        : []),

    Classifications: async (user) => {
      const userId = user._id ? user._id.toString() : user.Id || user.id;
      if (!userId) return [];
      const classifications = await Classification_Level.find({ User_Id: userId })
        .sort({ createdAt: -1 })
        .limit(10);

      return classifications.map((classification) => ({
        ...classification.toObject(),
        Id: classification._id.toString(),
        Created_At: classification.createdAt.toISOString(),
      }));
    },
  },
};