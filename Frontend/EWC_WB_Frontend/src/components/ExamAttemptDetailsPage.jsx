import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Navbar } from './Navbar';
import { useAuth } from '../contexts/AuthContext';
import { getExamAttemptById } from '../graphql/AIService';
import {
  ArrowLeft, FileText, Clock3, Trophy, BadgeCheck,
  ShieldAlert, Languages, Sparkles, CheckCircle2,
  AlertTriangle, Timer, CalendarDays, Target, Percent,
  ChevronDown, ChevronUp, ScanFace,
} from 'lucide-react';
import { TextDiffPanel } from '../utils/diffUtils';

// ─── helpers ──────────────────────────────────────────────────────────────────

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(value) {
  const d = safeDate(value);
  if (!d) return '-';
  return d.toLocaleString();
}

function scoreTone(value) {
  const v = toNumber(value);
  if (v >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (v >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function scoreBg(value) {
  const v = toNumber(value);
  if (v >= 80) return 'from-emerald-500 to-teal-500';
  if (v >= 60) return 'from-amber-500 to-orange-500';
  return 'from-red-500 to-rose-500';
}

// ─── Diff engine ──────────────────────────────────────────────────────────────

/**
 * Tokenise: split by whitespace keeping the whitespace tokens so we can
 * reconstruct the original spacing faithfully.
 */

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, hint, accent }) {
  return (
    <div className="rounded-2xl glass-sm p-5 transition-spring hover:shadow-md">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 glass-sm ${accent || 'bg-primary/10 text-primary'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  );
}

function ScoreBar({ label, value }) {
  const noData = value === null || value === undefined;
  const numeric = noData ? 0 : Math.max(0, Math.min(100, toNumber(value)));
  const grade =
    noData          ? 'N/A'        :
    numeric >= 90   ? 'Excellent'  :
    numeric >= 75   ? 'Good'       :
    numeric >= 60   ? 'Fair'       : 'Needs Work';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/60 font-medium">{grade}</span>
          {!noData && <p className={`text-xs font-bold ${scoreTone(numeric)}`}>{numeric}</p>}
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
        {!noData && (
          <div
            className={`h-1.5 rounded-full bg-gradient-to-r transition-all duration-700 ${scoreBg(numeric)}`}
            style={{ width: `${numeric}%` }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Per-question result card ─────────────────────────────────────────────────

function QuestionCard({ r, idx, questionText }) {
  const [expanded, setExpanded] = useState(true);
  const detectedIssues = Array.isArray(r?.Feedback_Detected_Issues) ? r.Feedback_Detected_Issues : [];
  const origText = r?.Answer_Text || '';
  const corrText = r?.Feedback_Corrected_Text || '';
  const hasDiff  = origText && corrText;

  // New v2 model: per-error breakdown (type, suggestion, explanation)
  const errorList = useMemo(() => {
    const e = r?.Feedback_Errors;
    if (!e) return [];
    if (Array.isArray(e)) return e;
    try { return JSON.parse(e) || []; } catch { return []; }
  }, [r]);

  const errTypeStyle = {
    GRAM:  { badge: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',  bar: 'bg-red-500',    label: 'Grammar'     },
    SPELL: { badge: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800', bar: 'bg-orange-500', label: 'Spelling'    },
    PUNCT: { badge: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800', bar: 'bg-yellow-500', label: 'Punctuation' },
    VOCAB: { badge: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',   bar: 'bg-blue-500',   label: 'Vocabulary'  },
    WO:    { badge: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800', bar: 'bg-purple-500', label: 'Word Order'  },
    STYLE: { badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', bar: 'bg-slate-400', label: 'Style' },
  };

  const issueColorMap = {
    grammar:     'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    punctuation: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
    vocabulary:  'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    spelling:    'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800',
  };

  return (
    <div className="rounded-3xl glass-md overflow-hidden animate-stagger">
      {/* Card header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-white/30 dark:hover:bg-white/5 transition-spring"
      >
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold">
            <FileText className="w-3.5 h-3.5" />
            Q{idx + 1}
          </span>
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{questionText}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`text-sm font-bold ${scoreTone(r?.Feedback_Overall_Score)}`}>
            {toNumber(r?.Awarded_Points)}/{toNumber(r?.Points)} pts
          </span>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
          }
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-border/40">
          {/* Score bars row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 pt-4">
            {[
              { label: 'Overall',     value: r?.Feedback_Overall_Score   },
              { label: 'Grammar',     value: r?.Feedback_Grammar_Score   },
              { label: 'Vocabulary',  value: r?.Feedback_Vocab_Score     },
              { label: 'Spelling',    value: r?.Feedback_Spelling_Score  },
              { label: 'Punctuation', value: r?.Feedback_Punct_Score     },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl glass-sm p-3">
                <ScoreBar label={label} value={value} />
              </div>
            ))}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground glass-sm rounded-lg px-3 py-1.5">
              <BadgeCheck className="w-3.5 h-3.5" />
              Level: <span className="font-semibold text-primary ml-1">{r?.Classification_Level || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground glass-sm rounded-lg px-3 py-1.5">
              <Trophy className="w-3.5 h-3.5" />
              Confidence: <span className="font-semibold ml-1">{toNumber(r?.Classification_Confidence)}%</span>
            </div>
            {detectedIssues.map((issue, i) => (
              <span
                key={i}
                className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${issueColorMap[(issue || '').toLowerCase()] || 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'}`}
              >
                {issue}
              </span>
            ))}
          </div>

          {/* ── Diff panel ─────────────────────────────────────────── */}
          {hasDiff ? (
            <TextDiffPanel origText={origText} corrText={corrText} />
          ) : (
            <TextDiffPanel origText={origText} corrText={corrText || origText} />
          )}

          {/* ── Error breakdown ───────────────────────────────────────── */}
          {errorList.length > 0 && (
            <div className="rounded-2xl overflow-hidden border border-border/40 bg-background/60">
              {/* Section header */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40 bg-muted/20">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-semibold text-foreground tracking-wide">Error Breakdown</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                    {errorList.length}
                  </span>
                </div>
                {r?.Feedback_Dominant_Error && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>Most frequent:</span>
                    <span className="font-semibold text-foreground capitalize">{String(r.Feedback_Dominant_Error).replace(/_/g, ' ')}</span>
                  </div>
                )}
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[auto_1fr_1fr] gap-0 px-4 py-2 bg-muted/10 border-b border-border/30 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                <div className="w-24 pr-3">Type</div>
                <div className="pr-3">Original</div>
                <div>Correction</div>
              </div>

              {/* Error rows */}
              <div className="divide-y divide-border/30">
                {errorList.map((err, i) => {
                  const style = errTypeStyle[err.type] || errTypeStyle.STYLE;
                  const hasSuggestion = err.suggestion && err.suggestion !== err.text;
                  return (
                    <div key={i} className="grid grid-cols-[auto_1fr_1fr] gap-0 px-4 py-3 hover:bg-muted/10 transition-colors group">
                      {/* Type badge */}
                      <div className="w-24 pr-3 flex items-start pt-0.5">
                        <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md border ${style.badge}`}>
                          {err.label || style.label || err.type}
                        </span>
                      </div>

                      {/* Original */}
                      <div className="pr-4 min-w-0">
                        <p className="text-sm text-red-600 dark:text-red-400 font-medium break-words leading-relaxed">
                          {err.text}
                        </p>
                        {err.explanation && (
                          <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5">
                            {err.explanation}
                          </p>
                        )}
                      </div>

                      {/* Correction */}
                      <div className="min-w-0">
                        <p className={`text-sm font-medium break-words leading-relaxed ${hasSuggestion ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground/50 italic'}`}>
                          {hasSuggestion ? err.suggestion : 'No change'}
                        </p>
                        {/* Visual indicator bar */}
                        <div className={`mt-1.5 h-0.5 w-8 rounded-full opacity-40 ${style.bar}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ExamAttemptDetailsPage() {
  const { attemptId } = useParams();
  const navigate      = useNavigate();
  const { user }      = useAuth();

  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(null);
  const [error,   setError]   = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await getExamAttemptById({ Attempt_Id: attemptId });
        if (!active) return;
        if (!data) { setError('Exam attempt not found.'); return; }
        if (user?.id && data?.User_Id && user.id !== data.User_Id) {
          setError('You are not allowed to view this attempt.'); return;
        }
        setAttempt(data);
      } catch (e) {
        if (!active) return;
        setError(e.message || 'Failed to load exam details.');
      } finally {
        if (active) setLoading(false);
      }
    }
    if (attemptId) load();
    return () => { active = false; };
  }, [attemptId, user?.id]);

  const questionMap = useMemo(() => {
    const map = {};
    (attempt?.Questions || []).forEach((q) => { map[String(q?.Id)] = q?.Question || ''; });
    return map;
  }, [attempt]);

  const results = useMemo(() => Array.isArray(attempt?.Question_Results) ? attempt.Question_Results : [], [attempt]);

  const summary = useMemo(() => ({
    percentage:       toNumber(attempt?.Percentage),
    totalScore:       toNumber(attempt?.Total_Score),
    totalPoints:      toNumber(attempt?.Total_Points),
    finalLevel:       attempt?.Final_Level || attempt?.Level || 'A1',
    finalConfidence:  toNumber(attempt?.Final_Confidence),
  }), [attempt]);

  const statusStyles = {
    SUBMITTED:      { badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: CheckCircle2, label: 'Finalized' },
    AUTO_SUBMITTED: { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: AlertTriangle, label: 'Auto Submitted' },
    EXPIRED:        { badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: AlertTriangle, label: 'Expired' },
  };
  const st = statusStyles[attempt?.Status] || { badge: 'bg-muted text-muted-foreground', icon: Timer, label: attempt?.Status };

  return (
    <div className="min-h-screen page-bg transition-colors" data-page="exam">
      <Navbar />

      <main className="pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

          {/* ── Header card ─────────────────────────────────────────── */}
          <div className="rounded-3xl glass-md p-6 mb-6 relative overflow-hidden animate-spring-in">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/8 rounded-full blur-3xl pointer-events-none" />
            <div className="relative">
              <button
                onClick={() => navigate('/dashboard')}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Dashboard
              </button>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Exam Attempt Details</h1>
                {attempt && (
                  <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold ${st.badge}`}>
                    <st.icon className="w-4 h-4" />
                    {st.label}
                  </span>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-3xl glass-md p-16 text-center text-muted-foreground">
              Loading attempt details…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-border/60 bg-card p-16 text-center">
              <p className="text-destructive font-semibold mb-2">Unable to load details</p>
              <p className="text-muted-foreground text-sm">{error}</p>
            </div>
          ) : (
            <>
              {/* ── Metric cards ──────────────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
                <MetricCard icon={Percent}    label="Score"        value={`${summary.percentage}%`}                       hint="Overall percentage"           accent="bg-primary/10 text-primary" />
                <MetricCard icon={Target}     label="Points"       value={`${summary.totalScore}/${summary.totalPoints}`}  hint="Awarded / total"              accent="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400" />
                <MetricCard icon={BadgeCheck} label="Level"        value={summary.finalLevel}                             hint="Aggregated CEFR level"        accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" />
                <MetricCard icon={Trophy}     label="Confidence"   value={`${summary.finalConfidence}%`}                  hint="Classification confidence"     accent="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" />
                <MetricCard icon={Timer}      label="Auto Submit"  value={attempt.Auto_Submitted ? 'Yes' : 'No'}          hint="Time-limit submission"        accent={attempt.Auto_Submitted ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-muted text-muted-foreground'} />
                <MetricCard icon={ScanFace}  label="AI Detection" value={attempt.AI_Detected ? `Detected` : `${toNumber(attempt.AI_Confidence).toFixed(1)}% AI`} hint={attempt.AI_Detected ? 'AI-generated content was detected' : 'Probability that content is AI-generated'} accent={attempt.AI_Detected ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : toNumber(attempt.AI_Confidence) > 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'} />
              </div>

              {/* ── Timeline ──────────────────────────────────────── */}
              <div className="rounded-3xl glass-md p-5 mb-6">
                <h2 className="text-base font-semibold text-foreground mb-4">Timeline &amp; Metadata</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { icon: CalendarDays, label: 'Started',   value: formatDateTime(attempt.Started_At) },
                    { icon: Clock3,       label: 'Expires',   value: formatDateTime(attempt.Expires_At) },
                    { icon: Clock3,       label: 'Submitted', value: formatDateTime(attempt.Submitted_At) },
                    { icon: Timer,        label: 'Duration',  value: `${toNumber(attempt.Duration_Minutes)} min` },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="rounded-xl glass-sm p-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
                        <Icon className="w-3.5 h-3.5" />{label}
                      </p>
                      <p className="text-sm font-medium text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Per-question results ───────────────────────────── */}
              <div className="space-y-4">
                {results.length === 0 ? (
                  <div className="rounded-2xl border border-border/60 bg-card p-12 text-center text-muted-foreground">
                    No per-question details found for this attempt.
                  </div>
                ) : (
                  results.map((r, idx) => (
                    <QuestionCard
                      key={idx}
                      r={r}
                      idx={idx}
                      questionText={questionMap[String(r?.Question_Id ?? '')] || 'Question text unavailable'}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}