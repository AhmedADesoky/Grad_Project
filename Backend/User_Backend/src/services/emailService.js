import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';

const APP_NAME = 'English Writing Coach';

// Lazy transporter — reads env vars at call time, not at module load
function getTransporter() {
  // Strip spaces from App Password (Google shows it with spaces but SMTP needs them removed)
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const user = process.env.GMAIL_USER;

  if (!user || !pass) {
    throw new Error('GMAIL_USER or GMAIL_APP_PASSWORD is not set in environment');
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,   // SSL
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

export async function sendOTPEmail(to, otp) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    to,
    subject: `${otp} is your ${APP_NAME} verification code`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
        <h2 style="color:#7c3aed;margin-bottom:8px;">Verify your email</h2>
        <p style="color:#374151;font-size:15px;">Use the code below to verify your account. It expires in <strong>10 minutes</strong>.</p>
        <div style="text-align:center;margin:32px 0;">
          <span style="font-size:42px;font-weight:700;letter-spacing:12px;color:#1f2937;background:#fff;padding:16px 32px;border-radius:8px;border:2px solid #e5e7eb;">${otp}</span>
        </div>
        <p style="color:#6b7280;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function sendWelcomeEmail(to, userName) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Welcome to ${APP_NAME}, ${userName}!`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
        <h2 style="color:#7c3aed;">Welcome, ${userName}!</h2>
        <p style="color:#374151;font-size:15px;">Your email is verified and your account is ready. Start your first exam to get your writing level and generate your personalized learning plan.</p>
        <a href="${process.env.FRONTEND_ORIGIN}" style="display:inline-block;margin-top:16px;padding:12px 28px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Go to Dashboard</a>
      </div>
    `,
  });
}

// ── Exam Score Report ────────────────────────────────────────────────────────
export async function sendExamScoreEmail(to, { userName, score, level, passed, weakAreas = [] }) {
  const transporter = getTransporter();
  const passColor  = passed ? '#16a34a' : '#dc2626';
  const passLabel  = passed ? 'Passed' : 'Needs Work';
  const uniqueWeakAreas = [...new Set(weakAreas.map(a => String(a).toLowerCase()))].map(a => a.charAt(0).toUpperCase() + a.slice(1));
  const weakList   = uniqueWeakAreas.length
    ? uniqueWeakAreas.map(a => `<li style="margin:4px 0;color:#374151;font-size:14px;">${a}</li>`).join('')
    : '<li style="color:#6b7280;font-size:14px;">No major weak areas detected</li>';

  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Your exam result: ${level} — ${score}% | ${APP_NAME}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
        <h2 style="color:#7c3aed;margin-bottom:4px;">Exam Results</h2>
        <p style="color:#6b7280;font-size:14px;margin-top:0;">Hi ${userName}, here&apos;s how you did.</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-collapse:separate;border-spacing:8px;">
          <tr>
            <td width="33%" style="background:#fff;border-radius:10px;padding:16px;text-align:center;border:1px solid #e5e7eb;">
              <p style="font-size:12px;color:#6b7280;margin:0 0 4px;text-transform:uppercase;letter-spacing:.05em;">Score</p>
              <p style="font-size:32px;font-weight:700;color:#1f2937;margin:0;">${score}%</p>
            </td>
            <td width="33%" style="background:#fff;border-radius:10px;padding:16px;text-align:center;border:1px solid #e5e7eb;">
              <p style="font-size:12px;color:#6b7280;margin:0 0 4px;text-transform:uppercase;letter-spacing:.05em;">Level</p>
              <p style="font-size:32px;font-weight:700;color:#7c3aed;margin:0;">${level}</p>
            </td>
            <td width="33%" style="background:#fff;border-radius:10px;padding:16px;text-align:center;border:1px solid #e5e7eb;">
              <p style="font-size:12px;color:#6b7280;margin:0 0 4px;text-transform:uppercase;letter-spacing:.05em;">Result</p>
              <p style="font-size:18px;font-weight:700;color:${passColor};margin:0;">${passLabel}</p>
            </td>
          </tr>
        </table>

        <div style="background:#fff;border-radius:10px;padding:20px;border:1px solid #e5e7eb;margin-bottom:20px;">
          <p style="font-size:13px;font-weight:600;color:#374151;margin:0 0 8px;">Areas to improve:</p>
          <ul style="margin:0;padding-left:18px;">${weakList}</ul>
        </div>

        <p style="color:#374151;font-size:14px;">Your personalized learning plan has been updated based on these results.</p>
        <a href="${process.env.FRONTEND_ORIGIN}" style="display:inline-block;margin-top:12px;padding:12px 28px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">View My Plan</a>

        <p style="color:#9ca3af;font-size:12px;margin-top:24px;">You received this email because you submitted an exam on ${APP_NAME}.</p>
      </div>
    `,
  });
}

// ── Exam Cancelled (AI Detection) ───────────────────────────────────────────
export async function sendExamCancelledEmail(to, { userName, aiConfidence }) {
  const transporter = getTransporter();
  const pct = Math.round(Number(aiConfidence || 0) * 100);

  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Your exam submission was cancelled | ${APP_NAME}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
        <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
          <tr>
            <td style="width:44px;height:44px;border-radius:50%;background:#fef2f2;text-align:center;vertical-align:middle;padding-right:12px;">
              <span style="font-size:22px;">⚠️</span>
            </td>
            <td style="vertical-align:middle;">
              <h2 style="color:#dc2626;margin:0;">Exam Submission Cancelled</h2>
            </td>
          </tr>
        </table>

        <p style="color:#374151;font-size:15px;line-height:1.6;">
          Hi <strong>${userName}</strong>, your recent exam submission was cancelled because our system detected a high likelihood of AI-generated content in your answers.
        </p>

        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;margin:24px 0;text-align:center;">
          <p style="font-size:13px;color:#6b7280;margin:0 0 6px;text-transform:uppercase;letter-spacing:.05em;">AI Detection Confidence</p>
          <p style="font-size:42px;font-weight:700;color:#dc2626;margin:0;">${pct}%</p>
        </div>

        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Our exams are designed to assess <strong>your own writing ability</strong>. Using AI tools to generate your answers prevents us from giving you an accurate level assessment and a personalized learning plan.
        </p>

        <p style="color:#374151;font-size:14px;line-height:1.6;">
          You are welcome to retake the exam at any time — just make sure your answers are written entirely in your own words.
        </p>

        <a href="${process.env.FRONTEND_ORIGIN}/exam" style="display:inline-block;margin-top:16px;padding:12px 28px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Retake the Exam</a>

        <p style="color:#9ca3af;font-size:12px;margin-top:24px;">If you believe this is a mistake, please contact support.</p>
      </div>
    `,
  });
}

// ── Exam Technical Failure ───────────────────────────────────────────────────
export async function sendExamFailedEmail(to, { userName }) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    to,
    subject: `We couldn't process your exam | ${APP_NAME}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
        <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
          <tr>
            <td style="width:44px;height:44px;border-radius:50%;background:#fff7ed;text-align:center;vertical-align:middle;padding-right:12px;">
              <span style="font-size:22px;">⚙️</span>
            </td>
            <td style="vertical-align:middle;">
              <h2 style="color:#ea580c;margin:0;">Exam Processing Failed</h2>
            </td>
          </tr>
        </table>

        <p style="color:#374151;font-size:15px;line-height:1.6;">
          Hi <strong>${userName}</strong>, we're sorry — your recent exam submission could not be processed due to a temporary technical issue on our end.
        </p>

        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:20px;margin:24px 0;">
          <p style="font-size:14px;color:#374151;margin:0 0 8px;font-weight:600;">What happened?</p>
          <p style="font-size:14px;color:#6b7280;margin:0;line-height:1.6;">
            Our AI evaluation service was temporarily unavailable while processing your answers. Your answers were received correctly — this is not a problem with your submission.
          </p>
        </div>

        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Your daily exam attempt has <strong>not</strong> been counted against your limit. You can retake the exam right now.
        </p>

        <a href="${process.env.FRONTEND_ORIGIN}/exam" style="display:inline-block;margin-top:16px;padding:12px 28px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Retake the Exam</a>

        <p style="color:#9ca3af;font-size:12px;margin-top:24px;">If this keeps happening, please contact support.</p>
      </div>
    `,
  });
}

// ── Password Reset ───────────────────────────────────────────────────────────
export async function sendPasswordResetEmail(to, { userName, resetUrl }) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Reset your ${APP_NAME} password`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
        <h2 style="color:#7c3aed;margin-bottom:8px;">Reset your password</h2>
        <p style="color:#374151;font-size:15px;">Hi ${userName}, we received a request to reset your password. Click the button below — this link expires in <strong>1 hour</strong>.</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Reset Password</a>
        </div>
        <p style="color:#6b7280;font-size:13px;">If you didn't request a password reset, you can safely ignore this email. Your password won't change.</p>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px;">This link expires in 1 hour and can only be used once.</p>
      </div>
    `,
  });
}

// ── Daily Task Reminder ──────────────────────────────────────────────────────
export async function sendDailyReminderEmail(to, { userName, tasks = [], totalMinutes = 0 }) {
  const transporter = getTransporter();
  const taskRows = tasks.length
    ? tasks.map(t => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#1f2937;font-size:14px;">${t.title}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:13px;white-space:nowrap;">${t.type || 'Task'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;color:#7c3aed;font-size:13px;white-space:nowrap;">${t.minutes || 30} min</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:16px;text-align:center;color:#6b7280;font-size:14px;">No tasks scheduled for today — enjoy your rest day!</td></tr>`;

  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Today's tasks are ready — ${totalMinutes} min | ${APP_NAME}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
        <h2 style="color:#7c3aed;margin-bottom:4px;">Good morning, ${userName}!</h2>
        <p style="color:#6b7280;font-size:14px;margin-top:0;">Here are your writing tasks for today — estimated <strong>${totalMinutes} minutes</strong>.</p>

        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;margin:20px 0;">
          <thead>
            <tr style="background:#f5f3ff;">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#7c3aed;text-transform:uppercase;letter-spacing:.05em;">Task</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#7c3aed;text-transform:uppercase;letter-spacing:.05em;">Type</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#7c3aed;text-transform:uppercase;letter-spacing:.05em;">Time</th>
            </tr>
          </thead>
          <tbody>${taskRows}</tbody>
        </table>

        <a href="${process.env.FRONTEND_ORIGIN}" style="display:inline-block;padding:12px 28px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Start Writing</a>
      </div>
    `,
  });
}

// ── Weekly Progress Report ────────────────────────────────────────────────────
export async function sendWeeklyProgressEmail(to, { userName, tasksCompleted, tasksTotal, streak, level, progressPct }) {
  const transporter = getTransporter();
  const bar = Math.round((progressPct || 0) / 5); // out of 20 blocks
  const filled   = '█'.repeat(bar);
  const unfilled = '░'.repeat(20 - bar);

  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Your weekly progress: ${tasksCompleted} tasks done | ${APP_NAME}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
        <h2 style="color:#7c3aed;margin-bottom:4px;">Weekly Summary</h2>
        <p style="color:#6b7280;font-size:14px;margin-top:0;">Great effort this week, ${userName}! Here's your progress.</p>

        <div style="display:flex;gap:12px;margin:20px 0;flex-wrap:wrap;">
          <div style="flex:1;min-width:110px;background:#fff;border-radius:10px;padding:16px;text-align:center;border:1px solid #e5e7eb;">
            <p style="font-size:12px;color:#6b7280;margin:0 0 4px;text-transform:uppercase;letter-spacing:.05em;">Tasks Done</p>
            <p style="font-size:28px;font-weight:700;color:#1f2937;margin:0;">${tasksCompleted}<span style="font-size:14px;color:#6b7280;">/${tasksTotal}</span></p>
          </div>
          <div style="flex:1;min-width:110px;background:#fff;border-radius:10px;padding:16px;text-align:center;border:1px solid #e5e7eb;">
            <p style="font-size:12px;color:#6b7280;margin:0 0 4px;text-transform:uppercase;letter-spacing:.05em;">Streak</p>
            <p style="font-size:28px;font-weight:700;color:#f59e0b;margin:0;">${streak}<span style="font-size:14px;color:#6b7280;"> days</span></p>
          </div>
          <div style="flex:1;min-width:110px;background:#fff;border-radius:10px;padding:16px;text-align:center;border:1px solid #e5e7eb;">
            <p style="font-size:12px;color:#6b7280;margin:0 0 4px;text-transform:uppercase;letter-spacing:.05em;">Level</p>
            <p style="font-size:28px;font-weight:700;color:#7c3aed;margin:0;">${level}</p>
          </div>
        </div>

        <div style="background:#fff;border-radius:10px;padding:16px;border:1px solid #e5e7eb;margin-bottom:20px;">
          <p style="font-size:13px;color:#374151;margin:0 0 8px;">Plan Progress — <strong>${progressPct}%</strong></p>
          <p style="font-family:monospace;font-size:16px;color:#7c3aed;margin:0;letter-spacing:1px;">${filled}${unfilled}</p>
        </div>

        <a href="${process.env.FRONTEND_ORIGIN}" style="display:inline-block;padding:12px 28px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Continue Learning</a>
      </div>
    `,
  });
}
