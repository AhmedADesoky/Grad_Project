import cron from 'node-cron';
import User from '../models/User.js';
import { sendDailyReminderEmail, sendWeeklyProgressEmail } from './emailService.js';

const AI_BACKEND_URL = process.env.AI_BACKEND_URL || 'http://localhost:8000/graphql';

// Fetch active plan data for a user from the AI backend
async function fetchActivePlan(userId, mode = 'weekly') {
  try {
    const query = `
      query {
        Get_Active_Plan(User_Id: "${userId}", Mode: "${mode}") {
          Current_Period_Index
          Plan
        }
      }
    `;
    const res = await fetch(AI_BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    return data?.data?.Get_Active_Plan || null;
  } catch {
    return null;
  }
}

function parsePlan(planJson) {
  try {
    return typeof planJson === 'string' ? JSON.parse(planJson) : planJson;
  } catch {
    return null;
  }
}

function getTodayName() {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
}

function getTodayTasks(plan, periodIndex) {
  const parsed = parsePlan(plan);
  if (!parsed?.plan) return [];
  const period = parsed.plan[periodIndex] || parsed.plan[0];
  const dayObj = (period?.days || []).find(d => d.day === getTodayName());
  return dayObj?.tasks || [];
}

function getWeekProgress(plan) {
  const parsed = parsePlan(plan);
  if (!parsed?.plan) return { done: 0, total: 0, pct: 0 };
  const all = [];
  for (const p of parsed.plan) for (const d of p.days || []) all.push(...(d.tasks || []));
  const done = all.filter(t => t.status === 'submitted' || t.status === 'reviewed').length;
  return { done, total: all.length, pct: all.length ? Math.round(done / all.length * 100) : 0 };
}

// ── Daily reminder — every day at 8:00 AM ────────────────────────────────────
export function startDailyReminderJob() {
  cron.schedule('0 8 * * *', async () => {
    console.log('[Scheduler] Running daily task reminder...');
    try {
      const users = await User.find({ Is_Verified: true });
      for (const user of users) {
        try {
          const planData = await fetchActivePlan(user._id.toString(), user.Preferred_Plan_Mode || 'weekly');
          if (!planData) continue;

          const tasks = getTodayTasks(planData.Plan, planData.Current_Period_Index || 0);
          const pendingTasks = tasks.filter(t => t.status !== 'submitted' && t.status !== 'reviewed' && t.status !== 'cancelled');
          if (!pendingTasks.length) continue; // no tasks today — skip email

          const totalMinutes = pendingTasks.reduce((s, t) => s + (t.estimated_minutes || 30), 0);
          await sendDailyReminderEmail(user.Email, {
            userName: user.User_Name,
            tasks: pendingTasks.map(t => ({ title: t.title, type: t.type, minutes: t.estimated_minutes || 30 })),
            totalMinutes,
          });
        } catch (err) {
          console.error(`[Scheduler] Daily reminder failed for ${user.Email}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Daily reminder job error:', err.message);
    }
  }, { timezone: 'Africa/Cairo' });

  console.log('[Scheduler] Daily task reminder job registered (08:00 Cairo time)');
}

// ── Weekly progress — every Sunday at 9:00 AM ─────────────────────────────────
export function startWeeklyProgressJob() {
  cron.schedule('0 9 * * 0', async () => {
    console.log('[Scheduler] Running weekly progress report...');
    try {
      const users = await User.find({ Is_Verified: true });
      for (const user of users) {
        try {
          const planData = await fetchActivePlan(user._id.toString(), user.Preferred_Plan_Mode || 'weekly');
          if (!planData) continue;

          const { done, total, pct } = getWeekProgress(planData.Plan);
          const recentScores = user.Exam_Scores || [];
          const level = user.Level || 'A1';

          // Compute streak: count consecutive days with at least 1 submitted task (simplified)
          const streak = recentScores.length; // placeholder — real streak needs Task_Details

          await sendWeeklyProgressEmail(user.Email, {
            userName: user.User_Name,
            tasksCompleted: done,
            tasksTotal: total,
            streak,
            level,
            progressPct: pct,
          });
        } catch (err) {
          console.error(`[Scheduler] Weekly report failed for ${user.Email}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Weekly progress job error:', err.message);
    }
  }, { timezone: 'Africa/Cairo' });

  console.log('[Scheduler] Weekly progress job registered (Sunday 09:00 Cairo time)');
}

export function startAllJobs() {
  startDailyReminderJob();
  startWeeklyProgressJob();
}
