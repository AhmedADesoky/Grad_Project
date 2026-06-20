import React, { useEffect, useMemo, useState } from 'react';
import { PageLayout } from './PageLayout';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import {
  TrendingUp, Award, Target, Zap, ExternalLink, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { calcStreak } from '../utils/streak';
import { DashboardSkeleton } from './Skeleton';

// ── helpers ───────────────────────────────────────────────────────────────────
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

function toNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function safeDate(v) { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
function formatDate(v) { const d = safeDate(v); if (!d) return '—'; return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function dateKey(v) { const d = safeDate(v); if (!d) return null; return d.toISOString().slice(0, 10); }

function getStatus(attempt) {
  const s = toNumber(attempt?.Percentage);
  if (attempt?.Passed || s >= 60) return { text: 'Passed',      cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' };
  if (attempt?.Status === 'AUTO_SUBMITTED') return { text: 'Auto-submitted', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' };
  if (s >= 50) return { text: 'Needs work',  cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' };
  return { text: 'Not passed',  cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' };
}

// ── Glass card class ──────────────────────────────────────────────────────────
const G = 'rounded-3xl glass-md';

// ── Tooltip style (passed as contentStyle) ────────────────────────────────────
const TT = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '16px',
  color: 'var(--foreground)',
  fontSize: '12px',
  padding: '8px 14px',
  boxShadow: 'none',
};

// ── Activity heatmap — last 30 days ───────────────────────────────────────────
// Heatmap colour classes — one set per theme so cells are always visible.
// Using Tailwind className strings (not opacity modifiers) so JIT always emits them.
const CELL_CLS = {
  empty: 'bg-slate-300 dark:bg-slate-700',
  low:   'bg-blue-300  dark:bg-blue-800',
  mid:   'bg-blue-500  dark:bg-blue-500',
  high:  'bg-blue-700  dark:bg-blue-300',
};

function ActivityHeatmap({ dates }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const todayKey = today.toISOString().slice(0, 10);

  const counts = useMemo(() => {
    const map = {};
    dates.forEach(v => { if (v) map[v] = (map[v] || 0) + 1; });
    return map;
  }, [dates]);

  const DAYS = 30;
  const cells = useMemo(() => {
    const list = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      list.push({ key, count: counts[key] || 0, date: d });
    }
    return list;
  }, [today, counts]);

  const cellCls = (count) =>
    count === 0 ? CELL_CLS.empty
    : count === 1 ? CELL_CLS.low
    : count === 2 ? CELL_CLS.mid
    : CELL_CLS.high;

  const totalActive = cells.filter(c => c.count > 0).length;

  return (
    <div className="min-w-0 w-full">
      {/* Date labels */}
      <div
        className="mb-1.5"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${DAYS}, 1fr)`, gap: 3 }}
      >
        {cells.map(cell => (
          <div
            key={cell.key}
            className="text-center text-muted-foreground/60"
            style={{ fontSize: 8, fontWeight: 500, lineHeight: 1 }}
          >
            {cell.date.getDay() === 1 ? cell.date.getDate() : ''}
          </div>
        ))}
      </div>

      {/* Day cells — fully circular, responsive at any container width */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${DAYS}, 1fr)`, gap: 'clamp(2px, 0.6vw, 5px)' }}>
        {cells.map(cell => {
          const isToday = cell.key === todayKey;
          return (
            <div
              key={cell.key}
              title={`${cell.date.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' })}: ${cell.count} task${cell.count !== 1 ? 's' : ''} completed`}
              className={`rounded-full transition-colors cursor-default ${cellCls(cell.count)} ${isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`}
              style={{ aspectRatio: '1 / 1', minHeight: 8 }}
            />
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 mt-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/60">Less</span>
          {Object.values(CELL_CLS).map((cls, i) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cls}`} />
          ))}
          <span className="text-[10px] text-muted-foreground/60">More</span>
        </div>
        <span className="text-[10px] text-muted-foreground/60">
          {totalActive} active day{totalActive !== 1 ? 's' : ''} this month
        </span>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { metrics, feedback = [], classifications = [], examAttempts = [], activityDates = [], loading, refreshAnalytics } = useAnalytics();

  useEffect(() => { refreshAnalytics(); }, [location.key]); // re-fetch on every navigation

  const attemptsSorted = useMemo(() =>
    [...examAttempts].sort((a, b) => {
      const da = safeDate(a?.Submitted_At || a?.Created_At);
      const db = safeDate(b?.Submitted_At || b?.Created_At);
      return (da?.getTime() || 0) - (db?.getTime() || 0);
    }), [examAttempts]);

  const classLevelByDay = useMemo(() => {
    const m = {};
    classifications.forEach(c => { const k = dateKey(c?.Created_At); if (k && !m[k]) m[k] = c?.Level; });
    return m;
  }, [classifications]);

  const dashboardLevel = useMemo(() => {
    if (attemptsSorted.length > 0) {
      const last = attemptsSorted[attemptsSorted.length - 1];
      return last?.Final_Level || last?.Level || metrics?.latestLevel || user?.level || 'A1';
    }
    return metrics?.latestLevel || user?.level || 'A1';
  }, [attemptsSorted, metrics, user]);

  const totalAttempts      = attemptsSorted.length;
  const averageScore       = useMemo(() => totalAttempts ? Math.round(attemptsSorted.reduce((a, i) => a + toNumber(i?.Percentage), 0) / totalAttempts) : 0, [attemptsSorted]);
  const completionPct      = useMemo(() => totalAttempts ? Math.round(attemptsSorted.filter(i => i?.Passed || toNumber(i?.Percentage) >= 60).length / totalAttempts * 100) : 0, [attemptsSorted]);
  const studyStreak        = useMemo(() => calcStreak([...attemptsSorted.map(i => i?.Submitted_At || i?.Created_At), ...feedback.map(i => i?.Created_At)].filter(Boolean)), [attemptsSorted, feedback]);

  // previous-half average for delta
  const prevAvg = useMemo(() => {
    if (totalAttempts < 2) return null;
    const half = Math.ceil(totalAttempts / 2);
    const prev = attemptsSorted.slice(0, half);
    return Math.round(prev.reduce((a, i) => a + toNumber(i?.Percentage), 0) / prev.length);
  }, [attemptsSorted]);
  const scoreDelta = prevAvg !== null ? averageScore - prevAvg : null;

  // score-over-time data
  const progressData = useMemo(() => {
    if (!totalAttempts) return [];
    return attemptsSorted.slice(-8).map((a, i) => ({
      label: `Exam ${i + 1}`,
      score: Math.round(toNumber(a?.Percentage)),
    }));
  }, [attemptsSorted]);

  // per-skill over time
  const skillTrendData = useMemo(() => {
    if (!feedback.length) return [];
    return [...feedback].sort((a, b) => new Date(a.Created_At) - new Date(b.Created_At)).slice(-8).map((f, i) => ({
      label: `Exam ${i + 1}`,
      Grammar:     Math.round(toNumber(f?.Grammar_Score || 0)),
      Vocabulary:  Math.round(toNumber(f?.Vocab_Score   || 0)),
      Punctuation: Math.round(toNumber(f?.Punct_Score   || 0)),
    }));
  }, [feedback]);

  // radar
  const radarData = useMemo(() => [
    { skill: 'Grammar',     score: Math.round(toNumber(metrics?.avgGrammar)) },
    { skill: 'Vocabulary',  score: Math.round(toNumber(metrics?.avgVocab))   },
    { skill: 'Punctuation', score: Math.round(toNumber(metrics?.avgPunct))   },
    { skill: 'Overall',     score: Math.round(toNumber(metrics?.avgOverall)) },
  ], [metrics]);

  // histogram buckets (0-9,10-19,...,90-100)
  const histData = useMemo(() => {
    const buckets = Array.from({ length: 10 }, (_, i) => ({ range: `${i * 10}–${i * 10 + 9}`, count: 0 }));
    attemptsSorted.forEach(a => {
      const s = Math.min(99, Math.max(0, Math.floor(toNumber(a?.Percentage) / 10) * 10));
      buckets[Math.floor(s / 10)].count++;
    });
    return buckets;
  }, [attemptsSorted]);

  // activityDates comes directly from AnalyticsContext (task Submitted_At dates)

  // table rows
  const tableRows = useMemo(() =>
    [...attemptsSorted].slice(-10).reverse().map(a => {
      const dt  = a?.Submitted_At || a?.Created_At;
      const day = dateKey(dt);
      return {
        attemptId: a?.Attempt_Id,
        date:      formatDate(dt),
        level:     a?.Final_Level || a?.Level || (day && classLevelByDay[day]) || dashboardLevel,
        score:     Math.round(toNumber(a?.Percentage)),
        ...getStatus(a),
      };
    }), [attemptsSorted, classLevelByDay, dashboardLevel]);

  const DeltaBadge = ({ delta }) => {
    if (delta === null) return null;
    if (delta > 0) return <span className="flex items-center gap-0.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium"><ArrowUpRight className="w-3 h-3"/>{delta}%</span>;
    if (delta < 0) return <span className="flex items-center gap-0.5 text-[11px] text-red-500 font-medium"><ArrowDownRight className="w-3 h-3"/>{Math.abs(delta)}%</span>;
    return <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/60 font-medium"><Minus className="w-3 h-3"/>0%</span>;
  };

  if (loading && !metrics) {
    return (
      <PageLayout>
        <div className="space-y-4">
          <DashboardSkeleton />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="space-y-4">

        {/* ── Header ── */}
        <section className={G + ' px-6 py-5 flex items-center justify-between gap-4 animate-spring-in'}>
          <div>
            <h1 className="text-[20px] font-bold text-foreground leading-tight">Dashboard</h1>
            <p className="text-[13px] text-muted-foreground/70 mt-0.5">Your writing analytics and progress overview.</p>
          </div>
          <div className="flex-shrink-0 flex flex-col items-center justify-center w-[58px] h-[58px] rounded-2xl glass-sm border-primary/20">
            <span className="text-[20px] font-bold text-primary leading-none">{dashboardLevel}</span>
            <span className="text-[8px] uppercase tracking-[0.2em] text-primary/50 mt-0.5 font-semibold">CEFR</span>
          </div>
        </section>

        {/* ── Stat cards ── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Average score',   value: `${averageScore}%`,    icon: TrendingUp, delta: scoreDelta, sub: 'vs earlier half',         iconCls: 'text-violet-500 dark:text-violet-400', bg: 'bg-violet-50/70 dark:bg-violet-900/15' },
            { label: 'Pass rate',        value: `${completionPct}%`,   icon: Target,     delta: null,       sub: `${totalAttempts} exams`,   iconCls: 'text-emerald-500 dark:text-emerald-400', bg: 'bg-emerald-50/70 dark:bg-emerald-900/15' },
            { label: 'Exams done',       value: String(totalAttempts), icon: Award,      delta: null,       sub: 'total attempts',            iconCls: 'text-blue-500 dark:text-blue-400',   bg: 'bg-blue-50/70 dark:bg-blue-900/15'   },
            { label: 'Study streak',     value: `${studyStreak}d`,     icon: Zap,        delta: null,       sub: 'consecutive days',          iconCls: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-50/70 dark:bg-amber-900/15' },
          ].map(({ label, value, icon: Icon, delta, sub, iconCls, bg }) => (
            <div key={label} className={G + ' p-5 flex items-center gap-4'}>
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 glass-sm ${bg}`}>
                <Icon className={`w-[18px] h-[18px] ${iconCls}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground/60 font-medium truncate">{label}</p>
                <p className="text-[20px] font-bold text-foreground leading-tight">{value}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {delta !== null ? <DeltaBadge delta={delta} /> : <span className="text-[10px] text-muted-foreground/45">{sub}</span>}
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* ── Charts row 1: score trend + radar ── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Score over time */}
          <div className={G + ' lg:col-span-2 p-5'}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55 font-semibold mb-0.5">Score trend</p>
                <h3 className="text-[15px] font-bold text-foreground">Exam scores over time</h3>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
                <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-primary rounded"/>&nbsp;Score</span>
                <span className="flex items-center gap-1"><span className="inline-block w-5 border-t border-dashed border-muted-foreground/40"/>&nbsp;Pass (60%)</span>
              </div>
            </div>
            {progressData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={progressData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="gScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--primary)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.25} />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TT} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
                  <ReferenceLine y={60} stroke="var(--muted-foreground)" strokeDasharray="5 4" strokeOpacity={0.45} />
                  <Area type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={2.5}
                    fill="url(#gScore)" dot={{ fill: 'var(--primary)', r: 4, stroke: 'var(--card)', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-[13px] text-muted-foreground/60">No exam data yet.</div>
            )}
          </div>

          {/* Radar — skill balance */}
          <div className={G + ' p-5'}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55 font-semibold mb-0.5">Skill balance</p>
            <h3 className="text-[15px] font-bold text-foreground mb-4">Skills radar</h3>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                <PolarGrid stroke="var(--border)" opacity={0.4} />
                <PolarAngleAxis dataKey="skill" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="score" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} strokeWidth={2}
                  dot={{ fill: 'var(--primary)', r: 3 }} />
                <Tooltip contentStyle={TT} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ── Charts row 2: skill trends + histogram ── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Per-skill trend lines */}
          <div className={G + ' p-5'}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55 font-semibold mb-0.5">Per-skill progress</p>
            <h3 className="text-[15px] font-bold text-foreground mb-1">Skills over time</h3>
            <div className="flex items-center gap-3 mb-3 text-[10px] text-muted-foreground/60">
              <span className="flex items-center gap-1">
                <svg width="16" height="4" viewBox="0 0 16 4"><line x1="0" y1="2" x2="16" y2="2" stroke="#10b981" strokeWidth="2" strokeDasharray="5 2"/></svg>
                Grammar
              </span>
              {[['Vocabulary','#f59e0b'],['Punctuation','#3b82f6']].map(([l,c])=>(
                <span key={l} className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 rounded" style={{background:c}}/>{l}</span>
              ))}
            </div>
            {skillTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={skillTrendData} margin={{ top: 12, right: 16, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.25} />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TT} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
                  <Line type="monotone" dataKey="Vocabulary"  stroke="#f59e0b" strokeWidth={2}   dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="Punctuation" stroke="#3b82f6" strokeWidth={2}   dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="Grammar"     stroke="#10b981" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-[13px] text-muted-foreground/60">No feedback data yet.</div>
            )}
          </div>

          {/* Score distribution histogram */}
          <div className={G + ' p-5'}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55 font-semibold mb-0.5">Score distribution</p>
            <h3 className="text-[15px] font-bold text-foreground mb-4">How your scores cluster</h3>
            {totalAttempts > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={histData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.25} vertical={false} />
                  <XAxis dataKey="range" stroke="var(--muted-foreground)" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TT} cursor={{ fill: 'var(--muted)', opacity: 0.2 }} />
                  <Bar dataKey="count" fill="var(--primary)" fillOpacity={0.75} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-[13px] text-muted-foreground/60">No exam data yet.</div>
            )}
          </div>
        </section>

        {/* ── Activity heatmap ── */}
        <section className={G + ' p-5'}>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55 font-semibold mb-0.5">Activity</p>
          <h3 className="text-[15px] font-bold text-foreground mb-4">Study activity — last 30 days</h3>
          <ActivityHeatmap dates={activityDates} />
        </section>

        {/* ── Recent exam results ── */}
        <section className={G + ' p-5'}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/55 font-semibold mb-0.5">History</p>
              <h3 className="text-[15px] font-bold text-foreground">Recent exam results</h3>
            </div>
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center bg-emerald-50/80 dark:bg-emerald-900/20 border border-border/20">
              <Award className="w-[17px] h-[17px] text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-[13px] text-muted-foreground/60">Loading…</div>
          ) : tableRows.length > 0 ? (
            <>
              {isMobile ? (
                /* Mobile card list — only rendered on small screens */
                <div className="space-y-2.5">
                  {tableRows.map((row, i) => (
                    <div key={i} onClick={() => row.attemptId && navigate('/exam-attempt/' + row.attemptId)}
                      className="flex items-center justify-between px-4 py-3.5 rounded-2xl glass-sm hover:shadow-md transition-spring cursor-pointer">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold bg-primary/10 text-primary">{row.level}</span>
                          <span className="text-[11px] text-muted-foreground/60">{row.date}</span>
                        </div>
                        <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold ${row.cls}`}>{row.text}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-[18px] font-bold text-foreground">{row.score}%</p>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 ml-auto" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Desktop table — only rendered on larger screens */
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="border-b border-border/25">
                        {['Date','Level','Score','Status',''].map(h => (
                          <th key={h} className="text-left pb-3 px-3 text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/50">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row, i) => (
                        <tr key={i} onClick={() => row.attemptId && navigate('/exam-attempt/' + row.attemptId)}
                          className="border-b border-border/15 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer">
                          <td className="py-3.5 px-3 text-[13px] text-muted-foreground/70">{row.date}</td>
                          <td className="py-3.5 px-3">
                            <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary">{row.level}</span>
                          </td>
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-2.5">
                              <span className="text-[15px] font-bold text-foreground">{row.score}%</span>
                              <div className="w-14 h-[4px] rounded-full bg-muted/50 overflow-hidden">
                                <div className={`h-full rounded-full ${row.score >= 60 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${row.score}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-3">
                            <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold ${row.cls}`}>{row.text}</span>
                          </td>
                          <td className="py-3.5 px-3">
                            <button type="button" onClick={e => { e.stopPropagation(); if (row.attemptId) navigate('/exam-attempt/' + row.attemptId); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/30 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
                              Open <ExternalLink className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-3xl bg-muted/40 flex items-center justify-center mx-auto mb-4">
                <Award className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <p className="font-semibold text-foreground mb-1">No exam attempts yet</p>
              <p className="text-[13px] text-muted-foreground/60 mb-6 max-w-xs mx-auto">Take your first exam to start tracking your progress.</p>
              <a href="/exam" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 transition-opacity">
                Take your first exam <TrendingUp className="w-4 h-4" />
              </a>
            </div>
          )}
        </section>

      </div>
    </PageLayout>
  );
}
