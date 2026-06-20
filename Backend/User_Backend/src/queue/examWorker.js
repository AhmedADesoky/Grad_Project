import { Worker } from 'bullmq';
import jwt from 'jsonwebtoken';
import { getRedisConnection } from './redisConnection.js';
import ExamSubmission from '../models/ExamSubmission.js';
import User from '../models/User.js';
import { addExamScore } from '../services/userService.js';
import { sendExamCancelledEmail, sendExamScoreEmail, sendExamFailedEmail } from '../services/emailService.js';

const AI_BACKEND_URL = process.env.AI_BACKEND_URL || 'http://localhost:8000/graphql';
const AI_DETECT_THRESHOLD = 97.0;
const MAX_EXAMS_PER_DAY = 3;

// Sign a short-lived service token so the worker can call Django's @require_auth
// mutations on behalf of a specific user. Uses the same secret the Node backend
// signs access tokens with — Django already trusts it.
function makeServiceToken(userId) {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error('ACCESS_TOKEN_SECRET is not set — cannot call Django auth endpoints');
  return jwt.sign({ sub: userId }, secret, { expiresIn: '10m' });
}

async function callAIDetect(answers) {
  const texts = answers.map(a => (a.Answer_Text || '').trim()).filter(Boolean);
  if (!texts.length) return { detected: false, confidence: 0 };

  const query = `
    mutation DetectAI($Text: String!) {
      Detect_AI(Text: $Text) {
        Success
        Result { Label Confidence AI_Probability Human_Probability }
        Error
      }
    }
  `;

  let maxAiProbability = 0;
  for (const text of texts) {
    try {
      const res = await fetch(AI_BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { Text: text } }),
      });
      const json = await res.json();
      const data = json?.data?.Detect_AI;
      if (!data?.Success) continue;
      const aiProbability = data.Result?.AI_Probability ?? 0;
      if (aiProbability > maxAiProbability) maxAiProbability = aiProbability;
    } catch (err) {
      console.error('[ExamWorker] AI detect call failed for one answer — skipping:', err.message);
    }
  }

  return { detected: maxAiProbability > AI_DETECT_THRESHOLD, confidence: maxAiProbability };
}

async function callAIEvaluate({ User_Id, Attempt_Id, Answers }) {
  const query = `
    mutation EvaluateExam(
      $User_Id: String!,
      $Attempt_Id: String,
      $Answers: [Exam_Answer_Input!]!

      $Save_To_Database: Boolean
    ) {
      Evaluate_Exam(
        User_Id: $User_Id,
        Attempt_Id: $Attempt_Id,
        Answers: $Answers,
        Save_To_Database: $Save_To_Database
      ) {
        Success
        Final_Level
        Total_Score
        Percentage
        Passed
        Question_Results {
          Question_Id
          Feedback_Grammar_Score
          Feedback_Vocab_Score
          Feedback_Punct_Score
          Feedback_Detected_Issues
          Feedback_Errors
        }
        AI_Detected
        AI_Confidence
        Error
      }
    }
  `;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout
  let res;
  try {
    res = await fetch(AI_BACKEND_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${makeServiceToken(User_Id)}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          User_Id,
          Attempt_Id,
          Answers: Answers.map(a => ({ ...a, Question_Id: Number(a.Question_Id) })),
          Save_To_Database: true,
        },
      }),
    });
  } finally {
    clearTimeout(timeout);
  }
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'AI evaluation error');
  return json.data?.Evaluate_Exam;
}

async function processExamJob(job) {
  const { submissionId, User_Id, Attempt_Id, Answers } = job.data;

  const submission = await ExamSubmission.findById(submissionId);
  if (!submission) throw new Error(`Submission ${submissionId} not found`);

  submission.Status = 'processing';
  await submission.save();

  // ── Daily exam limit check (atomic, first attempt only) ─────────────────
  // job.attemptsMade is 0 on the first try, >0 on BullMQ retries.
  // Only count against the daily quota on the first attempt — retries caused
  // by server errors (fetch failed, timeout) must not burn extra slots.
  const todayStr = new Date().toISOString().slice(0, 10);
  let todayCount;

  if (job.attemptsMade === 0) {
    // Atomically increment only if under the limit and the date matches.
    // If it's a new day, reset to 1. If already at limit, returns null.
    const limitUser = await User.findOneAndUpdate(
      {
        _id: User_Id,
        $or: [
          { Last_Exam_Date: { $lt: new Date(todayStr) } },
          { Last_Exam_Date: null },
          { Exam_Attempts_Today: { $lt: MAX_EXAMS_PER_DAY } },
        ],
      },
      [
        {
          $set: {
            Exam_Attempts_Today: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ['$Last_Exam_Date', null] },
                    { $lt: ['$Last_Exam_Date', new Date(todayStr)] },
                  ],
                },
                then: 1,
                else: { $add: ['$Exam_Attempts_Today', 1] },
              },
            },
            Last_Exam_Date: new Date(),
          },
        },
      ],
      { new: true },
    );

    if (!limitUser) {
      const checkUser = await User.findById(User_Id);
      if (!checkUser) throw new Error(`User ${User_Id} not found`);
      submission.Status = 'cancelled';
      submission.Error  = `Daily exam limit reached (${MAX_EXAMS_PER_DAY} per day). Try again tomorrow.`;
      await submission.save();
      const count = checkUser.Exam_Attempts_Today ?? MAX_EXAMS_PER_DAY;
      console.log(`[ExamWorker] Job ${job.id} cancelled — daily limit reached for user ${User_Id} (${count}/${MAX_EXAMS_PER_DAY})`);
      return;
    }
    todayCount = limitUser.Exam_Attempts_Today;
  } else {
    // Retry attempt — read current count without incrementing
    const existingUser = await User.findById(User_Id);
    if (!existingUser) throw new Error(`User ${User_Id} not found`);
    todayCount = existingUser.Exam_Attempts_Today ?? 1;
    console.log(`[ExamWorker] Job ${job.id} retry attempt ${job.attemptsMade} for user ${User_Id} — not incrementing daily count`);
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Run AI detection in the worker so submission returns instantly to the user
  const { detected, confidence } = await callAIDetect(Answers);
  if (detected) {
    submission.Status = 'cancelled';
    submission.Error = `AI-generated content detected (${confidence.toFixed(1)}% confidence).`;
    await submission.save();

    try {
      const user = await User.findById(User_Id);
      if (user) {
        await sendExamCancelledEmail(user.Email, {
          userName: user.User_Name,
          aiConfidence: confidence / 100,
        });
      }
    } catch (emailErr) {
      console.error('[ExamWorker] AI cancel email failed:', emailErr.message);
    }
    console.log(`[ExamWorker] Job ${job.id} cancelled — AI detected (${confidence.toFixed(1)}%)`);
    return;
  }

  // AI check passed — run full evaluation (Classification + Feedback inside)
  const result = await callAIEvaluate({ User_Id, Attempt_Id, Answers });

  // Django's Evaluate_Exam also runs AI detection internally — handle that case
  if (!result?.Success) {
    if (result?.AI_Detected) {
      const aiConf = Number(result.AI_Confidence || 0);
      submission.Status = 'cancelled';
      submission.Error = `AI-generated content detected (${aiConf.toFixed(1)}% confidence).`;
      await submission.save();

      try {
        const user = await User.findById(User_Id);
        if (user) {
          await sendExamCancelledEmail(user.Email, {
            userName: user.User_Name,
            aiConfidence: aiConf / 100,
          });
        }
      } catch (emailErr) {
        console.error('[ExamWorker] AI cancel email (from evaluate) failed:', emailErr.message);
      }
      console.log(`[ExamWorker] Job ${job.id} cancelled by evaluate — AI detected (${aiConf.toFixed(1)}%)`);
      return;
    }
    throw new Error(result?.Error || 'AI evaluation returned failure');
  }

  const percentage = Math.round(Number(result.Percentage || 0));
  // Use null when Final_Level is missing — addExamScore skips the Level
  // update if null, so a failed classification never downgrades the user.
  const level = result.Final_Level || null;
  const passed = Boolean(result.Passed);

  // Collect weak areas from detected issues + error type labels
  const weakAreas = [];
  const seen = new Set();
  const ERR_LABEL = { GRAM: 'Grammar', SPELL: 'Spelling', PUNCT: 'Punctuation', VOCAB: 'Vocabulary', WO: 'Word Order', STYLE: 'Style' };
  for (const qr of (result.Question_Results || [])) {
    for (const issue of (qr.Feedback_Detected_Issues || [])) {
      const key = String(issue || '').toLowerCase();
      if (key && !seen.has(key)) { seen.add(key); weakAreas.push(key.charAt(0).toUpperCase() + key.slice(1)); }
    }
    const errors = typeof qr.Feedback_Errors === 'string'
      ? (() => { try { return JSON.parse(qr.Feedback_Errors); } catch { return []; } })()
      : (qr.Feedback_Errors || []);
    for (const err of errors) {
      const rawType = (err.type || '').toUpperCase().replace(/MMAR$/, 'M');
      const label = ERR_LABEL[rawType] || err.label;
      const key = String(label || '').toLowerCase();
      if (key && !seen.has(key)) { seen.add(key); weakAreas.push(label); }
    }
  }

  // Save score + update level — non-fatal: a DB hiccup must not block the
  // submission status update or the result email.
  console.log(`[ExamWorker] Saving score — User_Id=${User_Id}, Score=${percentage}, Level=${level}`);
  let scoreSaved = false;
  try {
    await addExamScore({ User_Id, Score: percentage, Level: level });
    scoreSaved = true;
  } catch (scoreErr) {
    console.error('[ExamWorker] addExamScore failed — marking done anyway:', scoreErr.message);
  }

  submission.Status = 'done';
  await submission.save();

  // Send result email — always runs regardless of whether score save succeeded.
  try {
    const user = await User.findById(User_Id);
    if (user) {
      await sendExamScoreEmail(user.Email, {
        userName: user.User_Name,
        score: percentage,
        level,
        passed,
        weakAreas: weakAreas.slice(0, 5),
      });
    }
  } catch (emailErr) {
    console.error('[ExamWorker] Score result email failed:', emailErr.message);
  }

  console.log(`[ExamWorker] Job ${job.id} done — user ${User_Id}, score ${percentage}%, level ${level}, scoreSaved=${scoreSaved}`);
}

export function startExamWorker() {
  const worker = new Worker('exam-evaluation', processExamJob, {
    connection: getRedisConnection(),
    concurrency: 5,
    settings: {
      backoffStrategy: (attemptsMade) => Math.min(attemptsMade * 15_000, 60_000), // 15s, 30s, 45s, 60s...
    },
  });

  worker.on('completed', (job) => {
    console.log(`[ExamWorker] Job ${job.id} completed`);
  });

  worker.on('failed', async (job, err) => {
    console.error(`[ExamWorker] Job ${job?.id} failed:`, err.message);

    if (job?.data?.submissionId) {
      await ExamSubmission.findByIdAndUpdate(job.data.submissionId, {
        Status: 'failed',
        Error: err.message,
      }).catch(() => {});
    }

    // Send failure email only when all retries are exhausted — not on intermediate retries.
    const maxAttempts = job?.opts?.attempts ?? 1;
    const isLastAttempt = (job?.attemptsMade ?? 0) >= maxAttempts;
    if (isLastAttempt && job?.data?.User_Id) {
      try {
        const user = await User.findById(job.data.User_Id);
        if (user) {
          await sendExamFailedEmail(user.Email, { userName: user.User_Name });
        }
      } catch (emailErr) {
        console.error('[ExamWorker] Failure notification email failed:', emailErr.message);
      }
    }
  });

  console.log('[ExamWorker] Exam evaluation worker started (concurrency: 5)');
  return worker;
}
