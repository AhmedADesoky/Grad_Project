import dotenv from 'dotenv';
dotenv.config();

import dns from 'dns/promises';
import User from '../models/User.js';
import ExamSubmission from '../models/ExamSubmission.js';
import { getExamQueue } from '../queue/examQueue.js';
import RefreshToken from '../models/Refreshtoken.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { sendOTPEmail, sendWelcomeEmail, sendExamScoreEmail, sendExamCancelledEmail } from './emailService.js';

const AI_BACKEND_URL = process.env.AI_BACKEND_URL || 'http://localhost:8000/graphql';
const AI_DETECT_THRESHOLD = 70.0; // mirror the AI backend threshold

async function callAIDetect(answers) {
  const combinedText = answers.map(a => (a.Answer_Text || '').trim()).filter(Boolean).join('\n\n');
  if (!combinedText) return { detected: false, confidence: 0 };

  const query = `
    mutation DetectAI($Text: String!) {
      Detect_AI(Text: $Text) {
        Success
        Result { Label Confidence AI_Probability Human_Probability }
        Error
      }
    }
  `;
  try {
    const res = await fetch(AI_BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { Text: combinedText } }),
    });
    const json = await res.json();
    const data = json?.data?.Detect_AI;
    if (!data?.Success) return { detected: false, confidence: 0 };
    const aiProbability = (data.Result?.AI_Probability ?? 0);
    return { detected: aiProbability > AI_DETECT_THRESHOLD, confidence: aiProbability };
  } catch (err) {
    console.error('[AI Detect] Detection call failed — allowing submission:', err.message);
    return { detected: false, confidence: 0 };
  }
}

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7);

function ensureSecrets() {
  if (!ACCESS_TOKEN_SECRET) {
    throw new Error('Missing ACCESS_TOKEN_SECRET or JWT_SECRET in environment');
  }
  if (!REFRESH_TOKEN_SECRET) {
    throw new Error('Missing REFRESH_TOKEN_SECRET or JWT_SECRET in environment');
  }
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function getRefreshExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_TTL_DAYS);
  return d;
}

// ── Layer 1: DNS/MX domain check ─────────────────────────────────────────────
async function validateEmailDomain(email) {
  const domain = email.split('@')[1];
  if (!domain) return false;
  try {
    const records = await dns.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

// ── Layer 2: OTP helpers ─────────────────────────────────────────────────────
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

function otpExpiryDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 10); // 10 minutes
  return d;
}

function createAccessToken(userId) {
  ensureSecrets();
  return jwt.sign({ sub: userId }, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}

function createRefreshToken(userId, jti) {
  ensureSecrets();
  return jwt.sign({ sub: userId, jti }, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}

export const mapUserToGraphQL = (user, token = null) => {
  const progress = user.Progress || { completed: 0, total: 10 };
  const examScores = Array.isArray(user.Exam_Scores)
    ? user.Exam_Scores.map((s) => ({
        date: new Date(s.date).toISOString(),
        score: Number(s.score),
        level: s.level,
      }))
    : [];

  const createdAtIso = user.createdAt ? user.createdAt.toISOString() : new Date().toISOString();

  // Single source of truth — camelCase fields used everywhere in the frontend.
  // PascalCase aliases point to the same values so old resolvers keep working.
  const base = {
    id:              user._id.toString(),
    username:        user.User_Name,
    email:           user.Email,
    createdAt:       createdAtIso,
    token:           token,
    profileImage:    user.Profile_Image || null,
    level:           user.Level || 'A1',
    preferredPlanMode: user.Preferred_Plan_Mode || 'weekly',
    progress: {
      completed: Number(progress.completed ?? 0),
      total:     Number(progress.total ?? 10),
    },
    examScores,
  };

  // PascalCase aliases — reference base fields so they can never diverge
  base.Id         = base.id;
  base.User_Name  = base.username;
  base.Email      = base.email;
  base.Created_At = base.createdAt;
  base.Token      = base.token;

  return base;
};

export const signUp = async (User_Name, Email, Password) => {
  const normalizedEmail = Email.trim().toLowerCase();

  // Layer 1 — DNS/MX check
  const domainValid = await validateEmailDomain(normalizedEmail);
  if (!domainValid) {
    throw new Error('Email domain does not exist. Please use a real email address.');
  }

  const existingByEmail = await User.findOne({ Email: normalizedEmail });
  if (existingByEmail) {
    if (!existingByEmail.Is_Verified) {
      // Resend OTP for unverified duplicate
      const otp = generateOTP();
      existingByEmail.OTP = otp;
      existingByEmail.OTP_Expiry = otpExpiryDate();
      await existingByEmail.save();
      await sendOTPEmail(normalizedEmail, otp);
      throw new Error('UNVERIFIED_RESENT'); // frontend will show OTP screen
    }
    throw new Error('User with this Email already exists');
  }

  const existingByName = await User.findOne({ User_Name: User_Name.trim() });
  if (existingByName) {
    throw new Error('Username already taken. Please choose a different username.');
  }

  const otp = generateOTP();

  const newUser = new User({
    User_Name: User_Name.trim(),
    Email: normalizedEmail,
    Password,
    Profile_Image: null,
    Level: 'A1',
    Progress: { completed: 0, total: 10 },
    Exam_Scores: [],
    Is_Verified: false,
    OTP: otp,
    OTP_Expiry: otpExpiryDate(),
  });

  await newUser.save();

  // Layer 2 — send OTP email (non-blocking on failure)
  try {
    await sendOTPEmail(normalizedEmail, otp);
  } catch (emailErr) {
    console.error('OTP email failed:', emailErr.message);
  }

  return newUser;
};

export const logIn = async (Email, Password, meta = {}) => {
  const normalizedEmail = Email.trim().toLowerCase();
  const user = await User.findOne({ Email: normalizedEmail });

  if (!user) {
    throw new Error('User not found');
  }

  const isMatch = await user.comparePassword(Password);
  if (!isMatch) {
    throw new Error('Invalid Password');
  }

  if (!user.Is_Verified) {
    throw new Error('EMAIL_NOT_VERIFIED');
  }

  const accessToken = createAccessToken(user._id.toString());
  const jti = randomUUID();
  const refreshToken = createRefreshToken(user._id.toString(), jti);

  await RefreshToken.create({
    User_Id: user._id,
    Jti: jti,
    Token_Hash: hashToken(refreshToken),
    Expires_At: getRefreshExpiryDate(),
    User_Agent: meta.userAgent || null,
    IP_Address: meta.ipAddress || null,
    Revoked_At: null,
  });

  return {
    user: mapUserToGraphQL(user, accessToken),
    refreshToken,
  };
};

export const refreshAccessToken = async (rawRefreshToken, meta = {}) => {
  ensureSecrets();

  if (!rawRefreshToken) {
    throw new Error('Missing refresh token');
  }

  let decoded;
  try {
    decoded = jwt.verify(rawRefreshToken, REFRESH_TOKEN_SECRET);
  } catch {
    throw new Error('Invalid or expired refresh token');
  }

  const tokenHash = hashToken(rawRefreshToken);

  const tokenDoc = await RefreshToken.findOne({
    User_Id: decoded.sub,
    Jti: decoded.jti,
    Token_Hash: tokenHash,
    Revoked_At: null,
    Expires_At: { $gt: new Date() },
  });

  if (!tokenDoc) {
    throw new Error('Invalid or expired refresh token');
  }

  tokenDoc.Revoked_At = new Date();
  await tokenDoc.save();

  const user = await User.findById(decoded.sub);
  if (!user) {
    throw new Error('User not found');
  }

  const newAccessToken = createAccessToken(user._id.toString());
  const newJti = randomUUID();
  const newRefreshToken = createRefreshToken(user._id.toString(), newJti);

  await RefreshToken.create({
    User_Id: user._id,
    Jti: newJti,
    Token_Hash: hashToken(newRefreshToken),
    Expires_At: getRefreshExpiryDate(),
    User_Agent: meta.userAgent || null,
    IP_Address: meta.ipAddress || null,
    Revoked_At: null,
  });

  return {
    user: mapUserToGraphQL(user, newAccessToken),
    refreshToken: newRefreshToken,
  };
};

export const logoutByRefreshToken = async (rawRefreshToken) => {
  if (!rawRefreshToken) return true;

  const tokenHash = hashToken(rawRefreshToken);
  await RefreshToken.updateOne(
    { Token_Hash: tokenHash, Revoked_At: null },
    { $set: { Revoked_At: new Date() } }
  );

  return true;
};

export const updateProfile = async ({
  User_Id,
  User_Name,
  Email,
  Profile_Image,
  Level,
  Preferred_Plan_Mode,
  Progress_Completed,
  Progress_Total,
}) => {
  const user = await User.findById(User_Id);
  if (!user) {
    throw new Error('User not found');
  }

  if (typeof User_Name === 'string' && User_Name.trim().length > 0) {
    const nameTaken = await User.findOne({
      User_Name: User_Name.trim(),
      _id: { $ne: user._id },
    });
    if (nameTaken) {
      throw new Error('Username already taken. Please choose a different username.');
    }
    user.User_Name = User_Name.trim();
  }

  if (typeof Email === 'string' && Email.trim().length > 0) {
    const normalizedEmail = Email.trim().toLowerCase();
    const emailTaken = await User.findOne({
      Email: normalizedEmail,
      _id: { $ne: user._id },
    });
    if (emailTaken) {
      throw new Error('User with this Email already exists');
    }
    user.Email = normalizedEmail;
  }

  if (Profile_Image !== undefined) {
    user.Profile_Image = Profile_Image || null;
  }

  if (typeof Level === 'string' && Level.trim().length > 0) {
    user.Level = Level.trim();
  }

  if (Preferred_Plan_Mode === 'weekly' || Preferred_Plan_Mode === 'monthly') {
    user.Preferred_Plan_Mode = Preferred_Plan_Mode;
  }

  const nextCompleted =
    Progress_Completed !== undefined
      ? Number(Progress_Completed)
      : Number(user.Progress?.completed ?? 0);

  const nextTotal =
    Progress_Total !== undefined
      ? Number(Progress_Total)
      : Number(user.Progress?.total ?? 10);

  if (nextTotal <= 0) {
    throw new Error('Progress total must be greater than 0');
  }
  if (nextCompleted < 0) {
    throw new Error('Progress completed cannot be negative');
  }

  user.Progress = { completed: nextCompleted, total: nextTotal };

  await user.save();
  return user;
};

export const changePassword = async ({ User_Id, Current_Password, New_Password }) => {
  const user = await User.findById(User_Id);
  if (!user) {
    throw new Error('User not found');
  }

  if (!Current_Password || !New_Password) {
    throw new Error('Current password and new password are required');
  }

  if (New_Password.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }

  const isMatch = await user.comparePassword(Current_Password);
  if (!isMatch) {
    throw new Error('Current password is incorrect');
  }

  if (Current_Password === New_Password) {
    throw new Error('New password must be different from current password');
  }

  user.Password = New_Password;
  await user.save();

  await RefreshToken.updateMany(
    { User_Id: user._id, Revoked_At: null },
    { $set: { Revoked_At: new Date() } }
  );

  return true;
};

const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export const verifyOTP = async (Email, OTP, meta = {}) => {
  const normalizedEmail = Email.trim().toLowerCase();
  const user = await User.findOne({ Email: normalizedEmail });
  if (!user) throw new Error('User not found');
  if (user.Is_Verified) throw new Error('Email already verified');

  // Check lockout
  if (user.OTP_Locked_Until && new Date() < user.OTP_Locked_Until) {
    const secsLeft = Math.ceil((user.OTP_Locked_Until - new Date()) / 1000);
    throw new Error(`Too many failed attempts. Try again in ${secsLeft} seconds.`);
  }

  if (!user.OTP || user.OTP !== OTP.trim()) {
    user.OTP_Attempts = (user.OTP_Attempts || 0) + 1;
    if (user.OTP_Attempts >= OTP_MAX_ATTEMPTS) {
      user.OTP_Locked_Until = new Date(Date.now() + OTP_LOCKOUT_MS);
      user.OTP_Attempts = 0;
      await user.save();
      throw new Error(`Too many failed attempts. Account locked for 15 minutes.`);
    }
    await user.save();
    const remaining = OTP_MAX_ATTEMPTS - user.OTP_Attempts;
    throw new Error(`Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
  }
  if (!user.OTP_Expiry || new Date() > user.OTP_Expiry) {
    throw new Error('Verification code has expired. Please request a new one.');
  }

  user.Is_Verified = true;
  user.OTP = null;
  user.OTP_Expiry = null;
  user.OTP_Attempts = 0;
  user.OTP_Locked_Until = null;
  await user.save();

  // Send welcome email (non-blocking)
  try { await sendWelcomeEmail(normalizedEmail, user.User_Name); } catch {}

  // Return full auth session
  const accessToken = createAccessToken(user._id.toString());
  const jti = randomUUID();
  const refreshToken = createRefreshToken(user._id.toString(), jti);
  await RefreshToken.create({
    User_Id: user._id,
    Jti: jti,
    Token_Hash: hashToken(refreshToken),
    Expires_At: getRefreshExpiryDate(),
    User_Agent: meta.userAgent || null,
    IP_Address: meta.ipAddress || null,
    Revoked_At: null,
  });

  return { user: mapUserToGraphQL(user, accessToken), refreshToken };
};

export const resendOTP = async (Email) => {
  const normalizedEmail = Email.trim().toLowerCase();
  const user = await User.findOne({ Email: normalizedEmail });
  if (!user) throw new Error('User not found');
  if (user.Is_Verified) throw new Error('Email is already verified');

  const otp = generateOTP();
  user.OTP = otp;
  user.OTP_Expiry = otpExpiryDate();
  user.OTP_Attempts = 0;
  user.OTP_Locked_Until = null;
  await user.save();

  await sendOTPEmail(normalizedEmail, otp);
  return true;
};

export const queueExamSubmission = async ({ User_Id, Attempt_Id, Answers }) => {
  const user = await User.findById(User_Id);
  if (!user) throw new Error('User not found');

  // Run AI detection immediately — fast local model, no queue needed
  const { detected, confidence } = await callAIDetect(Answers);

  if (detected) {
    // Save cancelled submission so it appears in history
    await ExamSubmission.create({
      User_Id,
      Attempt_Id: Attempt_Id || null,
      Answers,
      Status: 'cancelled',
      Error: `AI-generated content detected (${confidence.toFixed(1)}% confidence).`,
    });

    // Send AI-detected cancellation email
    try {
      await sendExamCancelledEmail(user.Email, {
        userName: user.User_Name,
        aiConfidence: confidence / 100,
      });
      console.log(`[Email] AI cancelled email sent to ${user.Email}`);
    } catch (emailErr) {
      console.error(`[Email] AI cancelled email FAILED for ${user.Email}:`, emailErr.message);
      console.error('[Email] Full error:', emailErr);
    }

    return { queued: false, jobId: '', ai_detected: true, ai_confidence: confidence };
  }

  // AI check passed — queue full evaluation
  const submission = await ExamSubmission.create({
    User_Id,
    Attempt_Id: Attempt_Id || null,
    Answers,
    Status: 'pending',
  });

  const queue = getExamQueue();
  const job = await queue.add('evaluate', {
    submissionId: submission._id.toString(),
    User_Id,
    Attempt_Id: Attempt_Id || null,
    Answers,
  });

  submission.Job_Id = job.id;
  await submission.save();

  return { queued: true, jobId: job.id, ai_detected: false, ai_confidence: confidence };
};

export const addExamScore = async ({ User_Id, Score, Level }) => {
  const user = await User.findById(User_Id);
  if (!user) {
    throw new Error('User not found');
  }

  const scoreValue = Number(Score);
  if (Number.isNaN(scoreValue) || scoreValue < 0 || scoreValue > 100) {
    throw new Error('Score must be between 0 and 100');
  }

  user.Exam_Scores.push({
    date: new Date(),
    score: scoreValue,
    level: Level,
  });

  user.Level = Level;

  await user.save();

  // Send exam score report email
  try {
    await sendExamScoreEmail(user.Email, {
      userName: user.User_Name,
      score: scoreValue,
      level: Level,
      passed: scoreValue >= 70,
    });
    console.log(`[Email] Score email sent to ${user.Email}`);
  } catch (emailErr) {
    console.error(`[Email] Score email FAILED for ${user.Email}:`, emailErr.message);
    console.error('[Email] Full error:', emailErr);
  }

  return user;
};