import React, { useEffect, useState, useMemo } from 'react';
import { PageLayout } from './PageLayout';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import {
  ArrowRight, Sparkles, CheckCircle, Circle, ChevronRight,
} from 'lucide-react';
import { getActivePlan } from '../graphql/AIService';
import { calcStreak } from '../utils/streak';

const DAY_NAMES  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const SHORT_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function todayName() { return DAY_NAMES[new Date().getDay()]; }
function parseJsonField(val, fb = null) {
  if (!val) return fb;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fb; }
}

// ── Skill bar ──────────────────────────────────────────────────────────────────
const SKILL_COLORS = {
  grammar:     { fill: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  vocabulary:  { fill: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400'    },
  punctuation: { fill: 'bg-blue-500',    text: 'text-blue-600 dark:text-blue-400'      },
  overall:     { fill: 'bg-violet-500',  text: 'text-violet-600 dark:text-violet-400'  },
};

function SkillBar({ label, value, colorKey }) {
  const c   = SKILL_COLORS[colorKey] || SKILL_COLORS.overall;
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] text-muted-foreground w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-[5px] rounded-full bg-muted/50 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${c.fill}`} style={{ width:`${pct}%` }} />
      </div>
      <span className={`text-[12px] font-semibold w-8 text-right ${c.text}`}>{pct}%</span>
    </div>
  );
}

// ── Streak dots ────────────────────────────────────────────────────────────────
function StreakDots({ streak = 0 }) {
  const today = new Date().getDay();
  return (
    <div className="flex items-center gap-[5px]">
      {SHORT_DAYS.map((d, i) => {
        const daysAgo = (today - i + 7) % 7;
        const filled  = daysAgo < streak;
        const isToday = i === today;
        return (
          <div key={d} className="flex flex-col items-center gap-1">
            <div className={`w-[9px] h-[9px] rounded-full transition-all duration-300 ${
              filled
                ? isToday ? 'bg-primary ring-2 ring-primary/25' : 'bg-primary/65'
                : 'bg-muted/40'
            }`} />
            <span className={`text-[8px] font-medium ${isToday ? 'text-primary' : 'text-muted-foreground/45'}`}>{d[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Task row ───────────────────────────────────────────────────────────────────
const TASK_TYPE_STYLE = {
  writing_task:     { bg:'bg-blue-100 dark:bg-blue-900/30',    text:'text-blue-700 dark:text-blue-300',    label:'Writing' },
  grammar_exercise: { bg:'bg-violet-100 dark:bg-violet-900/30', text:'text-violet-700 dark:text-violet-300', label:'Grammar' },
  vocabulary_task:  { bg:'bg-amber-100 dark:bg-amber-900/30',  text:'text-amber-700 dark:text-amber-300',  label:'Vocab'   },
  reading_task:     { bg:'bg-teal-100 dark:bg-teal-900/30',    text:'text-teal-700 dark:text-teal-300',    label:'Reading' },
};

function TaskRow({ task }) {
  const done = task.status === 'submitted' || task.status === 'reviewed';
  const type = TASK_TYPE_STYLE[task.type] || TASK_TYPE_STYLE.writing_task;
  const mins = task.estimated_minutes ? `${task.estimated_minutes} min` : null;
  return (
    <Link to="/plan"
      className="flex items-center gap-3 px-4 py-3.5 rounded-2xl glass-sm hover:shadow-md transition-spring">
      <div className={`flex-shrink-0 ${done ? 'text-emerald-500' : 'text-muted-foreground/30'}`}>
        {done ? <CheckCircle className="w-[18px] h-[18px]" /> : <Circle className="w-[18px] h-[18px]" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] font-medium leading-tight truncate ${done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{task.title}</p>
        {mins && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{mins}</p>}
      </div>
      <span className={`flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full ${
        done ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : `${type.bg} ${type.text}`
      }`}>{done ? 'Done' : type.label}</span>
    </Link>
  );
}

// ── CEFR pill row ──────────────────────────────────────────────────────────────
const CEFR_LEVELS = ['A1','A2','B1','B2','C1','C2'];

function CEFRPills({ level }) {
  const idx = CEFR_LEVELS.indexOf(level);
  return (
    <div className="flex items-center justify-between gap-1.5">
      {CEFR_LEVELS.map((l, i) => {
        const state = i < idx ? 'done' : i === idx ? 'current' : 'future';
        return (
          <div key={l} className={`flex-1 flex items-center justify-center rounded-xl border py-2.5 transition-all duration-300 ${
            state === 'current'
              ? 'bg-primary text-primary-foreground border-primary/80 shadow-[0_2px_10px_0_rgba(0,0,0,0.12)] dark:shadow-[0_2px_10px_0_rgba(0,0,0,0.3)]'
              : state === 'done'
                ? 'bg-primary/10 dark:bg-primary/15 text-primary border-primary/15'
                : 'bg-muted/30 text-muted-foreground/35 border-border/20'
          }`}>
            <span className="text-[11px] font-bold tracking-wide">{l}</span>
          </div>
        );
      })}
    </div>
  );
}


// ── Glass card helper ──────────────────────────────────────────────────────────
const glass = 'rounded-3xl glass-md';

// ── Page ────────────────────────────────────────────────────────────────────────
export function MainPage() {
  const { user }    = useAuth();
  const { metrics, examAttempts = [], feedback = [] } = useAnalytics();

  const [planData, setPlanData]       = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(true);

  const userId   = user?.id || user?._id || user?.User_Id || user?.user_id || '';
  const username = user?.username || 'Student';

  const latestLevel  = metrics?.latestLevel   || user?.level || 'A1';
  const overallScore = Math.round(Number(metrics?.avgOverall || 0));
  const grammarScore = Math.round(Number(metrics?.avgGrammar || 0));
  const vocabScore   = Math.round(Number(metrics?.avgVocab   || 0));
  const punctScore   = Math.round(Number(metrics?.avgPunct   || 0));
  const totalEvals   = Number(metrics?.totalEvaluations || 0);

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    if (!userId) { setLoadingPlan(false); return; }
    (async () => {
      setLoadingPlan(true);
      try { setPlanData(await getActivePlan({ User_Id: userId, Mode: 'weekly' })); }
      catch { /* ignore */ }
      finally { setLoadingPlan(false); }
    })();
  }, [userId]);

  const { todayTasks, allTasks, submittedCount, focusSkills } = useMemo(() => {
    const parsed = parseJsonField(planData?.Plan, null);
    if (!parsed?.plan) return { todayTasks:[], allTasks:[], submittedCount:0, focusSkills:[] };
    const periodIdx = parsed.current_period_index || planData?.Current_Period_Index || 0;
    const period    = parsed.plan[periodIdx] || parsed.plan[0];
    const dayObj    = (period?.days || []).find(d => d.day === todayName());
    const allTs     = [];
    for (const p of parsed.plan) for (const d of (p.days || [])) allTs.push(...(d.tasks || []));
    const done = allTs.filter(t => t.status === 'submitted' || t.status === 'reviewed').length;
    return { todayTasks: dayObj?.tasks || [], allTasks: allTs, submittedCount: done, focusSkills: parsed.focus_skills || [] };
  }, [planData]);

  const streakDays = useMemo(() => calcStreak([
    ...examAttempts.map(a => a?.Submitted_At || a?.Created_At),
    ...feedback.map(f => f?.Created_At),
  ].filter(Boolean)), [examAttempts, feedback]);

  const totalTasks  = allTasks.length;
  const progressPct = totalTasks ? Math.round((submittedCount / totalTasks) * 100) : 0;
  const remaining   = todayTasks.filter(t => t.status !== 'submitted' && t.status !== 'reviewed').length;
  const doneToday   = todayTasks.length - remaining;
  const hasActivePlan = !!planData;

  return (
    <PageLayout>
      <div className="space-y-4">

        {/* ── Hero ── */}
        <section className={glass + ' p-6 animate-spring-in'}>
          <div className="flex items-start justify-between gap-4">

            {/* left */}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground/55 font-semibold mb-1.5">{greeting}</p>
              <h1 className="text-[26px] sm:text-[30px] font-bold text-foreground leading-tight tracking-tight">{username}</h1>
              <p className="text-[13px] text-muted-foreground/80 mt-1.5 leading-relaxed">
                {hasActivePlan
                  ? remaining > 0
                    ? <><span className="font-semibold text-foreground">{remaining} task{remaining > 1 ? 's' : ''}</span> due today · Overall <span className="font-semibold text-foreground">{overallScore}%</span></>
                    : <><span className="font-semibold text-emerald-600 dark:text-emerald-400">All done today</span> · Overall {overallScore}%</>
                  : 'Your personalized English learning space.'}
              </p>
              <div className="flex items-center gap-2.5 mt-5">
                <Link to="/plan"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 active:scale-[0.97] transition-all duration-150">
                  <Sparkles className="w-3.5 h-3.5" /> My Plan
                </Link>
                <Link to="/exam"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl border border-border/50 bg-background/40 text-foreground text-[13px] font-semibold hover:bg-muted/40 active:scale-[0.97] transition-all duration-150 backdrop-blur-sm">
                  Take Exam
                </Link>
              </div>
            </div>

            {/* right — level + streak */}
            <div className="flex-shrink-0 flex flex-col items-center gap-3.5">
              <div className="flex flex-col items-center justify-center w-[68px] h-[68px] rounded-2xl glass-sm border-primary/20">
                <span className="text-[26px] font-bold text-primary leading-none">{latestLevel}</span>
                <span className="text-[8px] uppercase tracking-[0.2em] text-primary/50 mt-0.5 font-semibold">CEFR</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <StreakDots streak={streakDays} />
                <p className="text-[9px] text-muted-foreground/50">{streakDays}-day streak</p>
              </div>
            </div>
          </div>
        </section>


        {/* ── No-plan banner ── */}
        {!loadingPlan && !hasActivePlan && (
          <section className={glass + ' p-5 flex flex-col sm:flex-row sm:items-center gap-4 border-primary/20 bg-primary/5'}>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-foreground">Start your personalized plan</p>
              <p className="text-[13px] text-muted-foreground/80 mt-1 leading-relaxed">
                Generate a CEFR-aligned weekly plan. AI selects tasks targeting your weak areas.
              </p>
            </div>
            <Link to="/plan"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-opacity flex-shrink-0">
              Create Plan <ArrowRight className="w-4 h-4" />
            </Link>
          </section>
        )}

        {/* ── Scores + CEFR ── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* scores + skill bars */}
          <div className={glass + ' p-5'}>
            <div className="grid grid-cols-4 gap-2 mb-5">
              {[
                { label:'Overall', value:`${overallScore}%`, color:'text-violet-600 dark:text-violet-400',   bg:'bg-violet-50/80 dark:bg-violet-900/15'   },
                { label:'Grammar', value:`${grammarScore}%`, color:'text-emerald-600 dark:text-emerald-400', bg:'bg-emerald-50/80 dark:bg-emerald-900/15' },
                { label:'Vocab',   value:`${vocabScore}%`,   color:'text-amber-600 dark:text-amber-400',     bg:'bg-amber-50/80 dark:bg-amber-900/15'     },
                { label:'Exams',   value:String(totalEvals), color:'text-blue-600 dark:text-blue-400',       bg:'bg-blue-50/80 dark:bg-blue-900/15'       },
              ].map(s => (
                <div key={s.label} className={`rounded-2xl p-2.5 text-center border border-border/20 ${s.bg}`}>
                  <p className={`text-[15px] font-bold leading-none ${s.color}`}>{s.value}</p>
                  <p className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground/60 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground/60 mb-3.5 uppercase tracking-[0.14em]">Skill breakdown</p>
            <div className="space-y-3.5">
              <SkillBar label="Grammar"     value={grammarScore} colorKey="grammar"     />
              <SkillBar label="Vocabulary"  value={vocabScore}   colorKey="vocabulary"  />
              <SkillBar label="Punctuation" value={punctScore}   colorKey="punctuation" />
              <SkillBar label="Overall"     value={overallScore} colorKey="overall"     />
            </div>
          </div>

          {/* CEFR pills + stats */}
          <div className={glass + ' p-5'}>
            <p className="text-[10px] font-semibold text-muted-foreground/60 mb-4 uppercase tracking-[0.14em]">CEFR journey</p>
            <CEFRPills level={latestLevel} />
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                { label:'Level',      value:latestLevel,       color:'text-primary'    },
                { label:'Exams done', value:totalEvals,        color:'text-foreground' },
                { label:'Progress',   value:`${progressPct}%`, color:'text-foreground' },
              ].map(s => (
                <div key={s.label} className="rounded-2xl bg-muted/25 border border-border/20 p-3 text-center">
                  <p className={`text-[17px] font-bold leading-none ${s.color}`}>{s.value}</p>
                  <p className="text-[9px] text-muted-foreground/55 mt-1.5 uppercase tracking-wider">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Today's Tasks + sidebar ── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          <div className={glass + ' lg:col-span-2 p-5'}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55 font-semibold mb-0.5">Today — {todayName()}</p>
                <h3 className="text-[15px] font-bold text-foreground">Today's Tasks</h3>
              </div>
              <Link to="/plan" className="flex items-center gap-1 text-[12px] font-semibold text-primary hover:text-primary/80 transition-colors">
                Full Plan <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {loadingPlan ? (
              <div className="py-10 text-center text-muted-foreground/60 text-sm">Loading plan…</div>
            ) : !hasActivePlan ? (
              <div className="py-8 text-center">
                <p className="text-[13px] text-muted-foreground/70">No plan yet — create one above to see your daily tasks here.</p>
              </div>
            ) : todayTasks.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle className="w-9 h-9 text-emerald-500 mx-auto mb-3 opacity-80" />
                <p className="font-semibold text-foreground">No tasks scheduled today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todayTasks.map((t, i) => <TaskRow key={t.task_id || i} task={t} />)}
                <div className="pt-2 flex items-center justify-between text-[11px] text-muted-foreground/60">
                  <span>{doneToday} of {todayTasks.length} completed</span>
                  {remaining > 0
                    ? <span className="text-amber-600 dark:text-amber-400 font-semibold">{remaining} remaining</span>
                    : <span className="text-emerald-600 dark:text-emerald-400 font-semibold">All done!</span>
                  }
                </div>
              </div>
            )}
          </div>

          {/* right col */}
          <div className="space-y-4">
            <div className={glass + ' p-5'}>
              <p className="text-[10px] font-semibold text-muted-foreground/60 mb-4 uppercase tracking-[0.14em]">Weekly progress</p>
              {hasActivePlan ? (
                <div className="flex items-center gap-4">
                  <div className="relative flex-shrink-0 w-16 h-16">
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border)" strokeWidth="5"/>
                      <circle cx="32" cy="32" r="26" fill="none" stroke="var(--primary)" strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={`${2*Math.PI*26}`}
                        strokeDashoffset={`${2*Math.PI*26*(1-progressPct/100)}`}
                        transform="rotate(-90 32 32)"/>
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-foreground">{progressPct}%</span>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-foreground leading-none">{submittedCount}<span className="text-sm font-normal text-muted-foreground/60">/{totalTasks}</span></p>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">tasks submitted</p>
                    {focusSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2.5">
                        {focusSkills.slice(0,2).map(sk => (
                          <span key={sk} className="text-[9px] px-2 py-0.5 rounded-full bg-primary/8 text-primary font-medium border border-primary/15">{sk}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : <p className="text-[13px] text-muted-foreground/60">No active plan.</p>}
            </div>

            <Link to="/plan" className={glass + ' flex items-center justify-between p-5 hover:bg-primary/5 transition-colors group border-primary/15'}>
              <div>
                <p className="text-[13px] font-semibold text-foreground">View Full Plan</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Submit tasks, track progress</p>
              </div>
              <ArrowRight className="w-4 h-4 text-primary/70 group-hover:translate-x-0.5 group-hover:text-primary transition-all" />
            </Link>
          </div>
        </section>

      </div>
    </PageLayout>
  );
}
