import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PageLayout } from './PageLayout';
import { useAuth, getUserId } from '../contexts/AuthContext';
import { usePlan } from '../contexts/PlanContext';
import { PlanQuestionnaire } from './PlanQuestionnaire';
import {
  ArrowLeft, BarChart3, BookOpen, CheckCircle, ChevronLeft,
  ChevronRight, Clock, ExternalLink, Lightbulb, Loader2, Pin, Play,
  RotateCcw, Save, Send, Shield, Target, TrendingUp, Trophy, User,
  X, AlertCircle, Award, FileText, Zap, Edit3, Sparkles, Link2,
  Video, Globe, BookMarked,
} from 'lucide-react';
import { EWCLogo } from './EWCLogo';
import { TextDiffPanel } from '../utils/diffUtils';
import UsageDashboard from './UsageDashboard';
import { PlanSkeleton } from './Skeleton';
import { useToast } from '../contexts/ToastContext';
import { checkAndIncrement, checkLimit } from '../graphql/UserServer';
import {
  generatePlan, generateNextPlan, getActivePlan, adjustPlan, savePlan,
  getPlanHistory, markPlanPeriodDone, startTask, submitTaskText, cancelTask, resetTask,
  getTaskHistory, getRecentClassifications, getUserDocumentAnalyses,
  trackResourceClick, generateTaskLearnFields,
} from '../graphql/AIService';

// ─── constants ────────────────────────────────────────────────────────────────
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const CACHE_KEY_PREFIX = 'ewc_plan_';
const CACHE_TTL_MS = 5 * 60 * 1000;
const glass = 'rounded-3xl border border-border/30 bg-card/80 backdrop-blur-xl';

// Module-level cache so results survive modal close/reopen within the same session
const _learnFieldsCache = new Map(); // task_id → { explanation, correction_reason }

function nextMonthResetStr() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  d.setHours(0, 0, 0, 0);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getAllTaskIds(plan) {
  const ids = new Set();
  for (const period of (plan?.plan || [])) {
    for (const day of (period?.days || [])) {
      for (const task of (day?.tasks || [])) {
        if (task?.task_id) ids.add(task.task_id);
      }
    }
  }
  return ids;
}

/**
 * Single source of truth for whether a task shows the "Done" label.
 * @param {object} task  - task object from plan JSON (has .status, .task_id)
 * @param {object|null} fb - matching Task_Details record from taskFeedback (may be null)
 */
function computeTaskDone(task, fb) {
  const s = task.status;
  if (s === 'reviewed') return true;
  if (s !== 'submitted') return false;
  // submitted: only real if there is actual written content
  if (fb) return !!(fb.Input_Text || fb.input_text || '').trim();
  return true; // submitted this session with no DB record yet — trust plan JSON
}

// ─── cache helpers ─────────────────────────────────────────────────────────────
function cacheSet(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}
function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) { sessionStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}
function cacheClear(key) { try { sessionStorage.removeItem(key); } catch {} }

function parseJsonField(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function getScore(scores, ...keys) {
  if (!scores) return 0;
  for (const k of keys) if (scores[k] != null) return Number(scores[k]);
  return 0;
}


function ExamScoreBar({ label, value, color }) {
  const colorMap = {
    blue:    { text: 'text-blue-500',    bar: 'bg-blue-500'    },
    green:   { text: 'text-emerald-500', bar: 'bg-emerald-500' },
    orange:  { text: 'text-orange-500',  bar: 'bg-orange-500'  },
    purple:  { text: 'text-purple-500',  bar: 'bg-purple-500'  },
    primary: { text: 'text-primary',     bar: 'bg-primary'     },
  };
  const { text, bar } = colorMap[color] || colorMap.primary;
  const noData = value === null || value === undefined;
  const numeric = noData ? 0 : Math.min(100, Math.round(Number(value) || 0));
  const grade =
    noData        ? 'N/A'       :
    numeric >= 90 ? 'Excellent' :
    numeric >= 75 ? 'Good'      :
    numeric >= 60 ? 'Fair'      : 'Needs Work';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-foreground">{label}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground/70 font-medium whitespace-nowrap">{grade}</span>
          {!noData && <span className={`text-sm font-bold ${text}`}>{numeric}</span>}
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        {!noData && (
          <div className={`h-full rounded-full transition-all duration-700 ${bar}`} style={{ width: `${numeric}%` }} />
        )}
      </div>
    </div>
  );
}

const ERR_TYPE_STYLE = {
  GRAM:  { badge: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',     bar: 'bg-red-500',    label: 'Grammar'     },
  SPELL: { badge: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800', bar: 'bg-orange-500', label: 'Spelling'    },
  PUNCT: { badge: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800', bar: 'bg-yellow-500', label: 'Punctuation' },
  VOCAB: { badge: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',   bar: 'bg-blue-500',   label: 'Vocabulary'  },
  WO:    { badge: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800', bar: 'bg-purple-500', label: 'Word Order'  },
  STYLE: { badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', bar: 'bg-slate-400', label: 'Style' },
};

function TaskFeedbackPanel({ feedback }) {
  if (!feedback) return null;

  const scores   = parseJsonField(feedback.Scores, {});
  const issues   = parseJsonField(feedback.Detected_Issues, []);
  const errorList = Array.isArray(feedback.Feedback_Errors)
    ? feedback.Feedback_Errors
    : parseJsonField(feedback.Feedback_Errors, []);
  const overall   = getScore(scores, 'overall_score',   'overall');
  const grammar   = getScore(scores, 'grammar_score',   'grammar');
  const vocab     = getScore(scores, 'vocab_score',     'vocab');
  const punct     = getScore(scores, 'punct_score',     'punct');
  const spelling  = getScore(scores, 'spelling_score',  'spelling');
  const inputTxt = feedback.Input_Text  || '';
  const corrTxt  = feedback.Corrected_Text || '';

  return (
    <div className="mt-4 border-t border-border pt-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Classification</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-sm font-bold text-foreground">Overall Score</p>
            {(feedback.Classified_Level || feedback.Level) && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {feedback.Classified_Level || feedback.Level}
              </span>
            )}
          </div>
          <p className={`text-2xl font-bold mt-1 ${overall >= 80 ? 'text-emerald-500' : overall >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
            {Number(overall).toFixed(2)}%
          </p>
          {feedback.Feedback_Dominant_Error && (
            <p className="text-xs text-muted-foreground mt-2">
              Dominant: <span className="font-medium text-foreground capitalize">{String(feedback.Feedback_Dominant_Error).replace(/_/g,' ')}</span>
            </p>
          )}
          {feedback.Feedback_Error_Trend && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Trend: <span className={`font-medium ${feedback.Feedback_Error_Trend === 'improving' ? 'text-emerald-500' : feedback.Feedback_Error_Trend === 'declining' ? 'text-red-500' : 'text-muted-foreground'}`}>{feedback.Feedback_Error_Trend}</span>
            </p>
          )}
          {/* AI detection result */}
          <div className={`mt-3 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold w-fit ${
            feedback.AI_Detected
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          }`}>
            <span>{feedback.AI_Detected ? '⚠ AI Detected' : 'Human Written'}</span>
            <span className="opacity-70">({Number(feedback.AI_Confidence ?? 0).toFixed(1)}%)</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Feedback Scores</span>
          </div>
          <div className="space-y-2">
            <ExamScoreBar label="Overall"     value={overall}  color="primary" />
            <ExamScoreBar label="Grammar"     value={grammar}  color="green"   />
            <ExamScoreBar label="Vocabulary"  value={vocab}    color="blue"    />
            <ExamScoreBar label="Spelling"    value={spelling} color="purple"  />
            <ExamScoreBar label="Punctuation" value={punct}    color="orange"  />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Detected Issues</span>
          </div>
          {issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No major issues detected.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {issues.map((issue, i) => {
                const colorMap = {
                  grammar:     'text-red-600 bg-red-500/10',
                  punctuation: 'text-orange-600 bg-orange-500/10',
                  vocabulary:  'text-blue-600 bg-blue-500/10',
                  spelling:    'text-purple-600 bg-purple-500/10',
                };
                const cls = colorMap[(issue || '').toLowerCase()] || 'text-amber-600 bg-amber-500/10';
                return (
                  <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
                    {issue}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Text comparison ── */}
      {(inputTxt || corrTxt) && (
        <TextDiffPanel origText={inputTxt} corrText={corrTxt} />
      )}

      {/* ── Error Breakdown ── */}
      {errorList.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-border/40 bg-background/60">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40 bg-muted/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-foreground tracking-wide">Error Breakdown</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                {errorList.length}
              </span>
            </div>
            {feedback.Feedback_Dominant_Error && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>Most frequent:</span>
                <span className="font-semibold text-foreground capitalize">{String(feedback.Feedback_Dominant_Error).replace(/_/g, ' ')}</span>
              </div>
            )}
          </div>
          {/* Column headers */}
          <div className="grid grid-cols-[auto_1fr_1fr] px-4 py-2 bg-muted/10 border-b border-border/30 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            <div className="w-24 pr-3">Type</div>
            <div className="pr-3">Original</div>
            <div>Correction</div>
          </div>
          {/* Rows */}
          <div className="divide-y divide-border/30">
            {errorList.map((err, i) => {
              const rawType = (err.type || err.label || '').toUpperCase().replace(/MMAR$/, 'M').trim();
              const typeKey = Object.keys(ERR_TYPE_STYLE).find(k => rawType.startsWith(k)) || null;
              const style = typeKey ? ERR_TYPE_STYLE[typeKey] : ERR_TYPE_STYLE.STYLE;
              const displayLabel = err.label || style.label || err.type || 'Other';
              const hasSuggestion = err.suggestion && err.suggestion !== err.text;
              return (
                <div key={i} className="grid grid-cols-[auto_1fr_1fr] px-4 py-3 hover:bg-muted/10 transition-colors">
                  <div className="w-24 pr-3 flex items-start pt-0.5">
                    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md border ${style.badge}`}>
                      {displayLabel}
                    </span>
                  </div>
                  <div className="pr-4 min-w-0">
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium break-words leading-relaxed">{err.text || '—'}</p>
                    {err.explanation && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5">{err.explanation}</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium break-words leading-relaxed ${hasSuggestion ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground/50 italic'}`}>
                      {hasSuggestion ? err.suggestion : 'No change'}
                    </p>
                    <div className={`mt-1.5 h-0.5 w-8 rounded-full opacity-40 ${style.bar}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    submitted:   { label: 'Done',        cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'  },
    reviewed:    { label: 'Reviewed',    cls: 'bg-blue-500/10 text-blue-600 border-blue-500/20'           },
    in_progress: { label: 'In Progress', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20'        },
    todo:        { label: 'To Do',       cls: 'bg-muted/60 text-muted-foreground border-border'            },
    cancelled:   { label: 'Skipped',     cls: 'bg-red-500/10 text-red-500/70 border-red-500/20'           },
  };
  const { label, cls } = map[status] || map.todo;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function ModePillSelector({ value, onChange }) {
  return (
    <div className="flex items-center rounded-xl border border-border bg-muted/40 p-1 gap-0.5">
      {['weekly','monthly'].map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all capitalize ${
            value === opt
              ? 'bg-background text-foreground shadow-sm border border-border'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt.charAt(0).toUpperCase() + opt.slice(1)}
        </button>
      ))}
    </div>
  );
}

// Derive minimum words for a task from its prompt text and estimated_minutes.
function getTaskMinWords(task) {
  if (task.prompt) {
    // Match "80-100 words" or "(80-100 words)" — pick the lower bound
    const rangeMatch = task.prompt.match(/\(?(\d+)\s*[–\-–]\s*(\d+)\s*words?\)?/i);
    if (rangeMatch) return +rangeMatch[1];

    // "at least N words" or "minimum N words" — only trust totals ≥ 20
    // (avoids false positives like "use at least 5 vocabulary words")
    const atLeastMatch = task.prompt.match(/(?:at\s+least|minimum\s+(?:of\s+)?)\s*(\d+)\s*words?/i);
    if (atLeastMatch && +atLeastMatch[1] >= 20) return +atLeastMatch[1];

    // "a paragraph of N words" or "write N words"
    const exactMatch = task.prompt.match(/(?:write|paragraph\s+of)\s+(\d+)\s*words?/i);
    if (exactMatch && +exactMatch[1] >= 20) return +exactMatch[1];
  }
  // Fall back: roughly 3 words per minute of writing time, minimum 30
  const mins = task.estimated_minutes || 30;
  return Math.max(30, Math.round(mins * 3));
}

// ─── LearnPhasePanel ─────────────────────────────────────────────────────────
function LearnPhasePanel({ task, collapsed, onToggle }) {
  const hasLearnContent = task.explanation || task.example_error || task.example_correction || task.correction_reason;
  if (!hasLearnContent) return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      {/* Header — always visible, click to expand/collapse */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-primary/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-primary">What to focus on</span>
        </div>
        <ChevronRight className={`w-4 h-4 text-primary transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`} />
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          {/* Explanation */}
          {task.explanation && (
            <p className="text-sm text-foreground leading-relaxed">{task.explanation}</p>
          )}

          {/* Error / Correction side-by-side */}
          {(task.example_error || task.example_correction) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {task.example_error && (
                <div className="rounded-lg border border-red-500/25 bg-red-500/8 p-3">
                  <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />Common Mistake
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 leading-relaxed italic">
                    "{task.example_error}"
                  </p>
                </div>
              )}
              {task.example_correction && (
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-3">
                  <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />Corrected
                  </p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 leading-relaxed italic">
                    "{task.example_correction}"
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Why */}
          {task.correction_reason && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/8 p-3">
              <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" />Why this works
              </p>
              <p className="text-sm text-foreground leading-relaxed">{task.correction_reason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TaskWritingModal ─────────────────────────────────────────────────────────
// Page 1 = "Learn"  (explanation, example, correction, why)
// Page 2 = "Write"  (textarea + submit) or "Feedback" (results) after submit
function TaskWritingModal({ task: rawTask, planId, userId, existingFeedback, onClose, onDone, onCancel }) {
  const task = {
    task_id: rawTask?.task_id ?? '',
    title: rawTask?.title ?? 'Writing Task',
    type: rawTask?.type ?? 'writing',
    prompt: rawTask?.prompt ?? '',
    estimated_minutes: rawTask?.estimated_minutes ?? 30,
    skills: rawTask?.skills ?? [],
    status: rawTask?.status ?? 'pending',
    example_error: rawTask?.example_error ?? '',
    example_correction: rawTask?.example_correction ?? '',
    explanation: rawTask?.explanation ?? '',
    correction_reason: rawTask?.correction_reason ?? '',
    ...rawTask,
  };

  // page: 'learn' | 'write' | 'feedback'
  const [page,        setPage]        = useState(existingFeedback ? 'feedback' : 'learn');
  const [answer,      setAnswer]      = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [feedback,    setFeedback]    = useState(existingFeedback || null);
  const [started,     setStarted]     = useState(!!existingFeedback);
  const [expired,     setExpired]     = useState(false);
  const [remaining,   setRemaining]   = useState((task.estimated_minutes || 30) * 60);
  const [err,         setErr]         = useState(null);
  const [aiRejected,  setAiRejected]  = useState(null);
  const timerRef     = useRef(null);
  const cancelledRef = useRef(false);

  const isSubmitted = task.status !== 'cancelled' && (task.status === 'submitted' || task.status === 'reviewed' || !!feedback);

  const doCancel = useCallback(async () => {
    if (cancelledRef.current || isSubmitted) return;
    cancelledRef.current = true;
    clearInterval(timerRef.current);
    try { await cancelTask({ User_Id: userId, Plan_Id: planId, Task_Id: task.task_id }); } catch { /* best-effort */ }
    if (onCancel) onCancel(task.task_id);
  }, [isSubmitted, userId, planId, task.task_id, onCancel]);

  const handleClose = async () => {
    if (started && !isSubmitted) await doCancel();
    onClose();
  };

  const handleStart = async () => {
    setErr(null);
    try {
      const res = await startTask({ User_Id: userId, Plan_Id: planId, Task_Id: task.task_id });
      if (!res?.Success) { setErr(res?.Error || 'Failed to start'); return; }
      setStarted(true);
      timerRef.current = setInterval(() =>
        setRemaining(p => {
          if (p <= 1) { clearInterval(timerRef.current); setExpired(true); doCancel(); return 0; }
          return p - 1;
        }), 1000);
    } catch (e) { setErr(e.message); }
  };

  const minWords  = getTaskMinWords(task);
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
  const meetsMin  = wordCount >= minWords;

  const handleSubmit = async () => {
    if (!answer.trim()) { setErr('Please write your answer first.'); return; }
    if (!meetsMin) { setErr(`Please write at least ${minWords} words (you have ${wordCount}).`); return; }
    setSubmitting(true); setErr(null);
    try {
      const res = await submitTaskText({ User_Id: userId, Plan_Id: planId, Task_Id: task.task_id, Input_Text: answer });
      if (res?.AI_Detected) {
        cancelledRef.current = true;
        clearInterval(timerRef.current);
        setAiRejected({ confidence: res.AI_Confidence ?? 0 });
        if (onCancel) onCancel(task.task_id);
        setTimeout(() => onClose(), 4000);
      } else if (res?.Success && res?.Task) {
        cancelledRef.current = true;
        clearInterval(timerRef.current);
        // Merge AI detection result into the task feedback object so the
        // TaskFeedbackPanel can display it without an extra API call.
        const enrichedTask = {
          ...res.Task,
          AI_Detected: res.AI_Detected ?? false,
          AI_Confidence: res.AI_Confidence ?? 0,
        };
        setFeedback(enrichedTask);
        setPage('feedback');
        if (onDone) onDone(task.task_id, enrichedTask, planId, res.Recommended_Resources || []);
      } else setErr(res?.Error || 'Submission failed');
    } catch (e) { setErr(e.message); }
    setSubmitting(false);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);
  const fmtTime = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  const isUrgent = remaining <= 300 && remaining > 0;

  const hasLearnContent = task.explanation || task.example_error || task.example_correction || task.correction_reason;

  // ── Step indicator ──────────────────────────────────────────────────────────
  const steps = [
    { key: 'learn',    label: 'Learn',    icon: <BookOpen className="w-3.5 h-3.5" /> },
    { key: 'write',    label: 'Write',    icon: <Edit3 className="w-3.5 h-3.5" /> },
    { key: 'feedback', label: 'Feedback', icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];
  const stepIndex = { learn: 0, write: 1, feedback: 2 }[page] ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-foreground truncate">{task.title}</h2>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />{task.estimated_minutes||30} min
                </span>
                {(task.skills||[]).length > 0 && (
                  <span className="text-xs text-muted-foreground">{task.skills.join(', ')}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Step pills */}
            <div className="hidden sm:flex items-center gap-1 bg-muted/40 rounded-xl p-1 border border-border">
              {steps.map((s, i) => (
                <div key={s.key} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  stepIndex === i
                    ? 'bg-background text-foreground shadow-sm border border-border'
                    : stepIndex > i
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground/50'
                }`}>
                  {stepIndex > i
                    ? <CheckCircle className="w-3 h-3" />
                    : s.icon}
                  {s.label}
                </div>
              ))}
            </div>
            {page === 'write' && started && !feedback && (
              <span className={`text-sm font-mono px-2.5 py-1 rounded-lg border ${
                isUrgent
                  ? 'text-red-500 border-red-500/30 bg-red-500/10'
                  : 'text-primary border-primary/20 bg-primary/5'
              }`}>
                {fmtTime(remaining)}
              </span>
            )}
            <button onClick={handleClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ═══════════════ PAGE 1 — LEARN ═══════════════ */}
          {page === 'learn' && (
            <div className="space-y-4">
              {!hasLearnContent ? (
                <div className="rounded-xl border border-border bg-muted/20 p-6 text-center">
                  <p className="text-sm text-muted-foreground">No learning material available for this task.</p>
                </div>
              ) : (
                <>
                  {task.explanation && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                      <p className="text-[10px] font-semibold text-primary uppercase tracking-widest flex items-center gap-1.5 mb-3">
                        <BookOpen className="w-3.5 h-3.5" /> What to focus on
                      </p>
                      <p className="text-sm text-foreground leading-relaxed">{task.explanation}</p>
                    </div>
                  )}

                  {task.example_error && (
                    <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-5">
                      <p className="text-[10px] font-semibold text-red-600 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                        <AlertCircle className="w-3.5 h-3.5" /> Common Mistake
                      </p>
                      <p className="text-sm text-red-700 dark:text-red-300 italic leading-relaxed font-mono">"{task.example_error}"</p>
                    </div>
                  )}

                  {task.example_correction && (
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5">
                      <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                        <CheckCircle className="w-3.5 h-3.5" /> Corrected
                      </p>
                      <p className="text-sm text-emerald-700 dark:text-emerald-300 italic leading-relaxed font-mono">"{task.example_correction}"</p>
                    </div>
                  )}

                  {task.correction_reason && (
                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
                      <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                        <Lightbulb className="w-3.5 h-3.5" /> Why This Works
                      </p>
                      <p className="text-sm text-foreground leading-relaxed">{task.correction_reason}</p>
                    </div>
                  )}

                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                    <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-widest mb-2">Your Task</p>
                    <p className="text-sm text-foreground leading-relaxed">{task.prompt}</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══════════════ PAGE 2 — WRITE ═══════════════ */}
          {page === 'write' && (
            <div className="space-y-4">
              {err && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />{err}
                </div>
              )}

              {/* AI rejection */}
              {aiRejected && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/8 p-5 flex flex-col items-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/25 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground mb-1">AI-Generated Content Detected</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Our system detected that this submission is likely AI-generated
                      {aiRejected.confidence > 0 ? ` (${Number(aiRejected.confidence).toFixed(1)}% confidence)` : ''}.
                      The task has been cancelled. Closing automatically…
                    </p>
                  </div>
                </div>
              )}

              {!aiRejected && (
                <>
                  <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Now Write Your Answer</p>
                    <p className="text-sm text-foreground leading-relaxed">{task.prompt}</p>
                    {(task.materials||[]).filter(m=>m?.url).length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {task.materials.filter(m=>m?.url).map((m,i) => (
                          <a key={i} href={m.url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-all">
                            <BookOpen className="w-3 h-3" />{m.title||'Resource'}<ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {!isSubmitted && (
                    <div className="space-y-3">
                      {!started ? (
                        <button onClick={handleStart}
                          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                          <Play className="w-4 h-4" />Start Writing
                        </button>
                      ) : (
                        <>
                          <textarea
                            value={answer}
                            onChange={e => setAnswer(e.target.value)}
                            disabled={expired}
                            placeholder={expired ? 'Time expired.' : 'Write your answer here…'}
                            rows={10}
                            className={`w-full rounded-xl border bg-white dark:bg-slate-800 p-4 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y disabled:opacity-50 transition-colors ${
                              wordCount > 0 && !meetsMin ? 'border-amber-500/50' : 'border-border'
                            }`}
                          />
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-medium transition-colors ${
                              wordCount === 0 ? 'text-muted-foreground'
                              : meetsMin      ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                            }`}>
                              {wordCount} / {minWords} words min
                              {wordCount > 0 && !meetsMin && ` — ${minWords - wordCount} more needed`}
                            </span>
                            <button
                              onClick={handleSubmit}
                              disabled={submitting || !answer.trim() || expired || !meetsMin}
                              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center gap-2"
                            >
                              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                              Submit Answer
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {expired && !feedback && (
                    <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-center text-destructive text-sm">
                      <AlertCircle className="w-5 h-5 mx-auto mb-1" />Time's up — you can no longer submit this task.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ═══════════════ PAGE 3 — FEEDBACK ═══════════════ */}
          {page === 'feedback' && feedback && (
            <TaskFeedbackPanel feedback={feedback} />
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between shrink-0">
          <div>
            {page === 'write' && hasLearnContent && (
              <button onClick={() => setPage('learn')}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors flex items-center gap-1.5">
                <ChevronLeft className="w-4 h-4" /> Back to Learn
              </button>
            )}
            {page === 'feedback' && (
              <button onClick={() => setPage('write')}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors flex items-center gap-1.5">
                <ChevronLeft className="w-4 h-4" /> Your Answer
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {page === 'learn' && (
              <button onClick={() => setPage('write')}
                className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5">
                Start Writing <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {page === 'feedback' && (
              <button onClick={handleClose} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
                Close
              </button>
            )}
            {page === 'write' && (
              <button onClick={handleClose} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors">
                {aiRejected ? 'Close' : 'Cancel'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ExamplesModal ────────────────────────────────────────────────────────────
function ExamplesModal({ task, userId, onClose }) {
  const [level,          setLevel]          = useState('B1');
  const [genExplanation, setGenExplanation] = useState(task.explanation?.trim() || '');
  const [genReason,      setGenReason]      = useState(task.correction_reason?.trim() || '');
  const [genLoading,     setGenLoading]     = useState(false);

  const needsGeneration = task.example_error && task.example_correction
    && (!task.explanation?.trim() || !task.correction_reason?.trim());

  useEffect(() => {
    (async () => {
      try {
        let lvl = 'B1';
        if (userId) {
          const cls = await getRecentClassifications({ User_Id: userId, Days: 30 });
          if (cls?.length) lvl = cls[0].Level || 'B1';
        }
        setLevel(lvl);

        if (needsGeneration) {
          // Return cached result immediately — skip the API call on subsequent opens
          const cached = task.task_id && _learnFieldsCache.get(task.task_id);
          if (cached) {
            if (cached.explanation)       setGenExplanation(cached.explanation);
            if (cached.correction_reason) setGenReason(cached.correction_reason);
          } else {
            setGenLoading(true);
            const gen = await generateTaskLearnFields({
              Example_Error:      task.example_error,
              Example_Correction: task.example_correction,
              Skills:             task.skills || [],
              Level:              lvl,
            });
            if (gen?.Success) {
              const entry = {
                explanation:       gen.Explanation       || '',
                correction_reason: gen.Correction_Reason || '',
              };
              if (task.task_id) _learnFieldsCache.set(task.task_id, entry);
              if (entry.explanation)       setGenExplanation(entry.explanation);
              if (entry.correction_reason) setGenReason(entry.correction_reason);
            }
          }
        }
      } catch (_) {}
      setGenLoading(false);
    })();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10"><Lightbulb className="w-5 h-5 text-primary" /></div>
            <div>
              <h2 className="text-base font-bold text-foreground">{task.title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Level {level} · learn before you write</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── Section 1: Task-specific learn fields (always shown first) ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold text-primary uppercase tracking-widest">About This Task</p>

            {/* Explanation — AI-generated if missing */}
            {genLoading ? (
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                <p className="text-xs text-muted-foreground">Generating explanation…</p>
              </div>
            ) : genExplanation ? (
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 space-y-1">
                <p className="text-[10px] font-semibold text-primary uppercase tracking-wide flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Explanation
                </p>
                <p className="text-sm text-foreground leading-relaxed">{genExplanation}</p>
              </div>
            ) : null}

            {/* Common Mistake */}
            {task.example_error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-1">
                <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Common Mistake
                </p>
                <p className="text-sm text-foreground leading-relaxed font-mono">{task.example_error}</p>
              </div>
            )}

            {/* Corrected */}
            {task.example_correction && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-1">
                <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Corrected
                </p>
                <p className="text-sm text-foreground leading-relaxed font-mono">{task.example_correction}</p>
              </div>
            )}

            {/* Why — AI-generated if missing */}
            {!genLoading && genReason && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-1">
                <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide flex items-center gap-1">
                  <Lightbulb className="w-3 h-3" /> Why this correction?
                </p>
                <p className="text-sm text-foreground leading-relaxed">{genReason}</p>
              </div>
            )}
          </div>

          {/* ── Divider ── */}
          {/* ── Task prompt reminder ── */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1.5">Your Task</p>
            <p className="text-sm text-foreground">{task.prompt}</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
            Got it — start writing
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Skill border helper ─────────────────────────────────────────────────────
function getSkillBorderClass(task) {
  const skills = ((task.skills||[]).join(' ')).toLowerCase();
  const type   = (task.type||'').toLowerCase();
  if (skills.includes('grammar') || type === 'grammar') return 'skill-border-grammar';
  if (skills.includes('vocab'))                          return 'skill-border-vocab';
  if (skills.includes('punct'))                          return 'skill-border-punct';
  if (skills.includes('writing') || type.includes('writing')) return 'skill-border-writing';
  return 'skill-border-default';
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────
function TaskCard({ task, feedback, highlighted = false, onOpen, onExample, onReset, onPin }) {
  const [expanded,  setExpanded]  = useState(false);
  const [resetting, setResetting] = useState(false);

  const isDone      = computeTaskDone(task, feedback ?? null);
  const isCancelled = !isDone && task.status === 'cancelled';

  const handleReset = async () => {
    if (!onReset) return;
    setResetting(true);
    await onReset(task.task_id);
    setResetting(false);
  };
  const borderCls = getSkillBorderClass(task);

  return (
    <div className={`glass-sm rounded-xl overflow-hidden transition-spring ${borderCls} ${
      isDone || isCancelled ? 'opacity-75' : 'hover:opacity-100'} ${
      highlighted ? 'ring-2 ring-primary/60 ring-offset-1 ring-offset-background animate-pulse' : ''}`}
      style={{ borderRadius:'0.875rem', paddingLeft:0 }}>

      <div className="p-3 sm:p-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
            <StatusBadge status={isCancelled ? 'cancelled' : task.status} />
            {task.type && <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wide">{task.type.replace(/_/g,' ')}</span>}
            <span className="text-[9px] sm:text-[10px] text-muted-foreground">{task.estimated_minutes||30} min</span>
          </div>
          <h4 className={`font-semibold text-[13px] sm:text-sm leading-snug break-words ${
            isDone      ? 'text-muted-foreground line-through decoration-1'
            : isCancelled ? 'text-muted-foreground/60 line-through decoration-1'
            : 'text-foreground'
          }`}>{task.title}</h4>
          {task.prompt && <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 break-words line-clamp-2 sm:line-clamp-none">{task.prompt}</p>}
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 self-end sm:self-start">
          {onPin && !isDone && !isCancelled && (
            <button onClick={() => onPin(task)} title="Ask about this task"
              className="p-1.5 sm:p-2 rounded-lg bg-primary/10 text-primary/70 hover:bg-primary/20 hover:text-primary transition-spring">
              <Pin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}
          <button onClick={() => onExample(task)} title="See examples"
            className="p-1.5 sm:p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-spring">
            <Lightbulb className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          {isDone ? (
            <button onClick={() => setExpanded(v => !v)}
              className="px-2 sm:px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-[11px] sm:text-xs font-semibold hover:bg-emerald-500/20 transition-spring flex items-center gap-1">
              <Award className="w-3 h-3 sm:w-3.5 sm:h-3.5" />{expanded ? 'Hide' : 'Feedback'}
            </button>
          ) : isCancelled ? (
            <button onClick={handleReset} disabled={resetting}
              className="px-2 sm:px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-[11px] sm:text-xs font-semibold hover:bg-muted/80 transition-spring flex items-center gap-1 sm:gap-1.5 disabled:opacity-50">
              {resetting ? <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" /> : <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}Retry
            </button>
          ) : (
            <button onClick={() => onOpen(task)}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] sm:text-xs font-semibold hover:opacity-90 transition-spring flex items-center gap-1 sm:gap-1.5">
              <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5" />Start
            </button>
          )}
        </div>
      </div>

      {(task.materials||[]).filter(m=>m?.url).length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {task.materials.filter(m=>m?.url).slice(0,3).map((m,i) => (
            <a key={i} href={m.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background text-[10px] text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
              <BookOpen className="w-3 h-3" />{m.title||'Resource'}
            </a>
          ))}
        </div>
      )}

      {isDone && expanded && feedback && (
        <div className="px-4 pb-5">
          <TaskFeedbackPanel feedback={feedback} />
        </div>
      )}
    </div>
  );
}

// ─── BotMessage — rich-text renderer for assistant responses ─────────────────
// Parses lines prefixed with ✗ / ✓ / 💡 and "Example N:" headers,
// then groups each Example block into a single card.
function BotMessage({ text }) {
  const rawSegments = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (/^Example\s+\d+:/i.test(line)) {
      const match = line.match(/^(Example\s+\d+):(.*)/i);
      rawSegments.push({ type: 'example-header', label: match[1], rest: match[2].trim() });
      continue;
    }
    if (line.startsWith('✗')) {
      rawSegments.push({ type: 'wrong', text: line.replace(/^✗\s*/, '') });
      continue;
    }
    if (line.startsWith('✓')) {
      rawSegments.push({ type: 'correct', text: line.replace(/^✓\s*/, '') });
      continue;
    }
    if (line.startsWith('💡')) {
      rawSegments.push({ type: 'tip', text: line.replace(/^💡\s*/, '') });
      continue;
    }
    rawSegments.push({ type: 'text', text: line });
  }

  // Group into example cards: each "example-header" starts a new card
  // containing the wrong/correct/tip rows that follow it.
  const hasExamples = rawSegments.some(s => s.type === 'example-header');

  if (!hasExamples) {
    // Plain text or single wrong/correct/tip block — render flat
    if (rawSegments.every(s => s.type === 'text')) {
      return <span className="text-sm leading-relaxed whitespace-pre-wrap">{text}</span>;
    }
    return (
      <div className="flex flex-col gap-1.5 text-sm">
        {rawSegments.map((seg, i) => <FlatSegment key={i} seg={seg} />)}
      </div>
    );
  }

  // Build grouped cards
  const cards = [];
  let current = null;
  for (const seg of rawSegments) {
    if (seg.type === 'example-header') {
      if (current) cards.push(current);
      current = { label: seg.label, rest: seg.rest, rows: [] };
    } else if (current) {
      current.rows.push(seg);
    } else {
      // text before first example header
      cards.push({ label: null, rows: [seg] });
    }
  }
  if (current) cards.push(current);

  return (
    <div className="flex flex-col gap-3 text-sm">
      {cards.map((card, ci) => {
        if (!card.label) {
          return (
            <div key={ci} className="flex flex-col gap-1">
              {card.rows.map((seg, i) => <FlatSegment key={i} seg={seg} />)}
            </div>
          );
        }
        return (
          <div key={ci} className="rounded-xl border border-border/50 overflow-hidden bg-background/40">
            {/* Card header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/30">
              <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                {card.label}
              </span>
              {card.rest && (
                <span className="text-[11px] text-foreground/70 font-medium truncate ml-2">{card.rest}</span>
              )}
            </div>
            {/* Card rows */}
            <div className="flex flex-col divide-y divide-border/30">
              {card.rows.map((seg, i) => (
                <div key={i} className={`flex items-start gap-2.5 px-3 py-2 ${
                  seg.type === 'wrong'   ? 'bg-red-500/4' :
                  seg.type === 'correct' ? 'bg-emerald-500/5' :
                  seg.type === 'tip'     ? 'bg-primary/4' : ''
                }`}>
                  {seg.type === 'wrong' && (
                    <>
                      <span className="shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/12 text-red-600 dark:text-red-400 border border-red-400/20">
                        Incorrect
                      </span>
                      <span className="text-[12px] text-red-700 dark:text-red-400 line-through leading-relaxed">{seg.text}</span>
                    </>
                  )}
                  {seg.type === 'correct' && (
                    <>
                      <span className="shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-400/20">
                        Correct
                      </span>
                      <span className="text-[12px] text-emerald-800 dark:text-emerald-300 font-medium leading-relaxed">{seg.text}</span>
                    </>
                  )}
                  {seg.type === 'tip' && (
                    <>
                      <span className="shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        Rule
                      </span>
                      <span className="text-[12px] text-foreground/75 leading-relaxed">{seg.text}</span>
                    </>
                  )}
                  {seg.type === 'text' && (
                    <span className="text-[12px] text-foreground/80 leading-relaxed">{seg.text}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FlatSegment({ seg }) {
  if (seg.type === 'wrong') return (
    <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-red-500/6 border border-red-400/20">
      <span className="shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/12 text-red-600 dark:text-red-400 border border-red-400/20">Incorrect</span>
      <span className="text-xs text-red-700 dark:text-red-400 line-through leading-relaxed">{seg.text}</span>
    </div>
  );
  if (seg.type === 'correct') return (
    <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-500/6 border border-emerald-400/20">
      <span className="shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-400/20">Correct</span>
      <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium leading-relaxed">{seg.text}</span>
    </div>
  );
  if (seg.type === 'tip') return (
    <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-primary/5 border border-primary/15">
      <span className="shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">Rule</span>
      <span className="text-xs text-foreground/75 leading-relaxed">{seg.text}</span>
    </div>
  );
  return <p className="text-sm text-foreground/90 leading-relaxed">{seg.text}</p>;
}

// ─── ResourcesPanel ───────────────────────────────────────────────────────────
const SKILL_ICON = {
  writing_grammar:     <BookMarked className="w-3.5 h-3.5" />,
  writing_process:     <BookOpen   className="w-3.5 h-3.5" />,
  paragraph_structure: <BookOpen   className="w-3.5 h-3.5" />,
  tense_usage:         <BookMarked className="w-3.5 h-3.5" />,
  punctuation:         <BookMarked className="w-3.5 h-3.5" />,
  vocabulary:          <Globe      className="w-3.5 h-3.5" />,
};
const SKILL_COLOR = {
  writing_grammar:     'text-blue-500 bg-blue-500/10',
  writing_process:     'text-emerald-600 bg-emerald-500/10',
  paragraph_structure: 'text-emerald-600 bg-emerald-500/10',
  tense_usage:         'text-amber-500 bg-amber-500/10',
  punctuation:         'text-purple-500 bg-purple-500/10',
  vocabulary:          'text-red-500 bg-red-500/10',
};

function ResourcesPanel({ resources, userId, onClear }) {
  if (!resources || resources.length === 0) return null;

  const handleClick = (resource) => {
    if (userId) trackResourceClick({ User_Id: userId, Resource_Url: resource.url });
    window.open(resource.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="glass-md rounded-2xl p-4 space-y-3 border border-primary/10" style={{ borderRadius:'1rem' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Recommended Resources</p>
        </div>
        <button onClick={onClear} className="p-1 rounded-lg hover:bg-muted transition-colors">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">Based on issues found in your last submission</p>
      <div className="space-y-2">
        {resources.map((r, i) => (
          <button key={r.url || i} onClick={() => handleClick(r)}
            className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-border/40 bg-muted/20 hover:bg-muted/50 hover:border-primary/20 transition-all group">
            <span className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${SKILL_COLOR[r.skill] || 'text-primary bg-primary/10'}`}>
              {SKILL_ICON[r.skill] || <Globe className="w-3.5 h-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">{r.title}</p>
              {r.source && <p className="text-[10px] text-muted-foreground mt-0.5">{r.source}</p>}
              {r.description && <p className="text-[10px] text-muted-foreground/70 mt-1 line-clamp-2">{r.description}</p>}
            </div>
            <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 mt-1 group-hover:text-primary transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── PlanResourcesPanel ───────────────────────────────────────────────────────
function PlanResourcesPanel({ resources, userId }) {
  if (!resources || resources.length === 0) return null;

  const handleClick = (resource) => {
    if (userId) trackResourceClick({ User_Id: userId, Resource_Url: resource.url });
    window.open(resource.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Link2 className="w-3.5 h-3.5 text-primary shrink-0" />
        <p className="text-[11px] font-semibold text-primary uppercase tracking-wide">
          Recommended Resources for This Plan
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {resources.map((r, i) => (
          <button
            key={r.url || i}
            onClick={() => handleClick(r)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-border/60
                       hover:border-primary/40 hover:bg-primary/5 transition-all group text-left"
          >
            <span className={`shrink-0 ${SKILL_COLOR[r.skill] || 'text-primary'}`}>
              {SKILL_ICON[r.skill] || <Globe className="w-3 h-3" />}
            </span>
            <span className="text-[11px] font-medium text-foreground group-hover:text-primary transition-colors truncate max-w-[160px]">
              {r.title}
            </span>
            <ExternalLink className="w-2.5 h-2.5 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── PlanChatPanel ────────────────────────────────────────────────────────────
function PlanChatPanel({ chatLog, chatInput, setChatInput, onSend, onUndo, isAdapting, hasChanges, chatEndRef, selectedDay, pinnedTask, onClearPin }) {
  const defaultSuggestions = ['Add grammar exercise', 'Make tasks easier', 'Add writing task'];
  const suggestions = selectedDay?.tasks?.length
    ? [
        `Make ${selectedDay.tasks[0]?.title?.slice(0,20) || 'first task'} shorter`,
        'Add vocabulary exercise today',
        'Make tasks easier',
      ]
    : defaultSuggestions;

  return (
    <div className={`flex flex-col overflow-hidden ${glass}`}>
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="relative shrink-0">
          <EWCLogo variant="agent" size={38} />
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card animate-day-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-none tracking-tight">Plan Assistant</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-none">
            {isAdapting ? (
              <span className="text-primary/70 font-medium">Thinking…</span>
            ) : 'Ask to adjust tasks or materials'}
          </p>
        </div>
        {hasChanges && (
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 font-semibold shrink-0 animate-spring-pop">
            Unsaved
          </span>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="overflow-y-auto px-4 py-4 flex flex-col gap-3" style={{ minHeight:220, maxHeight:310 }}>
        {chatLog.map((m, i) => (
          <div key={i} className={`flex gap-2 items-end animate-stagger delay-${Math.min(i,6)} ${m.role==='user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'bot' && (
              <EWCLogo variant="agent" size={24} className="mb-0.5 rounded-lg" />
            )}
            <div className="flex flex-col gap-1 max-w-[80%]">
              <div className={m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot'}>
                {m.role === 'bot' ? <BotMessage text={m.text} /> : m.text}
              </div>

              {/* Diff summary pill */}
              {m.role === 'bot' && m.diffSummary && (
                <div className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg bg-emerald-500/8 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 leading-snug ml-0.5 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  {m.diffSummary}
                </div>
              )}
              {/* Undo button */}
              {m.role === 'bot' && m.canUndo && (
                <button onClick={onUndo}
                  className="self-start text-[10px] px-2.5 py-1 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/40 transition-spring ml-0.5 flex items-center gap-1">
                  <RotateCcw style={{ width: 9, height: 9 }} />
                  Undo change
                </button>
              )}
            </div>
            {m.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0 mb-0.5">
                <User style={{ width:11, height:11, color:'var(--primary-foreground)' }} />
              </div>
            )}
          </div>
        ))}
        {/* Typing indicator */}
        {isAdapting && (
          <div className="flex gap-2 items-end justify-start animate-fade-in">
            <EWCLogo variant="agent" size={24} className="rounded-lg" />
            <div className="chat-bubble-bot flex items-center gap-2 px-4 py-3" style={{ minWidth: 64, overflow: 'visible' }}>
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  style={{
                    display:        'inline-block',
                    width:          8,
                    height:         8,
                    borderRadius:   '50%',
                    background:     'var(--primary)',
                    opacity:        0.55,
                    animation:      'typing-dot 1.2s infinite ease-in-out',
                    animationDelay: `${i * 0.18}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-border/40 space-y-2 bg-background/30">
        {/* Pinned task context badge */}
        {pinnedTask && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-primary/8 border border-primary/20 text-[11px]">
            <Pin className="w-3 h-3 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-muted-foreground">Context: </span>
              <span className="text-primary font-medium truncate">{pinnedTask.title}</span>
            </div>
            <button onClick={onClearPin} title="Remove context" className="w-4 h-4 flex items-center justify-center rounded-full opacity-40 hover:opacity-100 hover:bg-primary/10 transition-spring ml-1 text-foreground">✕</button>
          </div>
        )}
        {/* Suggestion chips — horizontally scrollable */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {suggestions.map(s => (
            <button key={s} onClick={() => { setChatInput(s); }}
              className="text-[11px] px-2.5 py-1 rounded-full border border-border/80 text-muted-foreground bg-background/80 hover:bg-primary/8 hover:border-primary/40 hover:text-primary transition-spring whitespace-nowrap flex-shrink-0">
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 glass-sm rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20" style={{ borderRadius:'0.875rem' }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key==='Enter' && !e.shiftKey && onSend()}
            placeholder={pinnedTask ? `Ask about "${pinnedTask.title}"…` : 'Adjust your plan…'}
            className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground/60"
          />
          <button onClick={onSend} disabled={isAdapting || !chatInput.trim()}
            className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-spring shrink-0">
            <Send style={{ width:14, height:14 }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export function PersonalizedPlan() {
  const { user, updateProfile } = useAuth();
  const { invalidate: invalidatePlan, updateTaskStatus } = usePlan();
  const toast = useToast();
  const [mode,                setMode]                = useState(() => user?.preferredPlanMode || 'weekly');
  const [planData,            setPlanData]            = useState(null);
  const [currentPlanId,       setCurrentPlanId]       = useState(null);
  const [draftPlan,           setDraftPlan]           = useState(null);
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);
  const [selectedDayIndex,    setSelectedDayIndex]    = useState(new Date().getDay());
  const [loading,             setLoading]             = useState(false);
  const [saving,              setSaving]              = useState(false);
  const [error,               setError]               = useState(null);
  const [info,                setInfo]                = useState(null);
  const [generatingNew,       setGeneratingNew]       = useState(false);
  const [taskFeedback,        setTaskFeedback]        = useState({});
  const [recommendations,     setRecommendations]     = useState([]); // latest resource recommendations
  const [history,             setHistory]             = useState([]);
  const [previewPlan,         setPreviewPlan]         = useState(null);
  const [modalTask,           setModalTask]           = useState(null);
  const [exampleTask,         setExampleTask]         = useState(null);

  const [modeSwitchPending,   setModeSwitchPending]   = useState(null);
  const [showQuestionnaire,   setShowQuestionnaire]   = useState(false);
  const [questGenerating,     setQuestGenerating]     = useState(false);
  const [suggestedFocus,      setSuggestedFocus]      = useState([]);
  // When opening questionnaire for a mode-switch renewal, pre-set target mode & saved goal
  const [questRenewalMode,    setQuestRenewalMode]    = useState(null);  // null = first-time
  const [savedGoal,           setSavedGoal]           = useState('');

  const [chatInput,    setChatInput]    = useState('');
  const [chatLog,      setChatLog]      = useState([
    { role: 'bot', text: "Plan Assistant ready.\n\nYou can ask me to:\n• \"Add a grammar task on Wednesday\"\n• \"Remove Friday's task\"\n• \"Make this week lighter\"\n• Pin a task and ask for an explanation or examples" }
  ]);
  const [isAdapting,        setIsAdapting]        = useState(false);
  const [pinnedTask,        setPinnedTask]        = useState(null);
  const [chatDepth,         setChatDepth]         = useState(0);
  const [highlightedTaskIds, setHighlightedTaskIds] = useState(new Set());
  const lastDraftRef   = useRef(null);
  const chatEndRef     = useRef(null);

  const userId   = getUserId(user);
  const cacheKey = `${CACHE_KEY_PREFIX}${userId}_${mode}`;
  const hasChanges = !!draftPlan && JSON.stringify(draftPlan) !== JSON.stringify(planData);

  // Latest exam ID from user's examScores (most recent entry)
  const latestExamScores = user?.examScores || [];
  const latestExamId = currentPlanId
    ? null  // resolved from active plan's Source_Exam_Id after load
    : null;

  // planLocked = true when no active plan AND no new exam to generate with
  // We track this after loadPlan sets info='needs_exam' or 'no_exam'
  const [planLocked,    setPlanLocked]    = useState(false);
  const [lockReason,    setLockReason]    = useState('needs_exam'); // 'needs_exam'|'no_exam'

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatLog, isAdapting]);

  const loadTaskFeedbackForPlan = useCallback(async (planId) => {
    if (!userId || !planId) return {};
    try {
      const items = await getTaskHistory({ User_Id: userId, Plan_Id: planId, Limit: 200 });
      return Object.fromEntries((items || []).map(t => [t.Task_Id, t]));
    } catch { return {}; }
  }, [userId]);

  const loadPlan = useCallback(async (selectedMode, forceRefresh = false) => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true); setError(null); setInfo(null);
    if (forceRefresh) setRecommendations([]);

    if (!forceRefresh) {
      const cached = cacheGet(cacheKey);
      if (cached && cached.plan && cached.id) {
        setPlanData(cached.plan); setDraftPlan(cached.plan);
        setCurrentPlanId(cached.id);
        setSelectedPeriodIndex(cached.periodIndex || 0);
        setSelectedDayIndex(new Date().getDay());
        setLoading(false);
        try {
          const planObj = typeof cached.plan === 'string' ? JSON.parse(cached.plan) : cached.plan;
          if (Array.isArray(planObj?.recommended_resources) && planObj.recommended_resources.length > 0) {
            setRecommendations(planObj.recommended_resources);
          }
        } catch (_) {}
        loadTaskFeedbackForPlan(cached.id).then(fb => { if (!cancelled) setTaskFeedback(fb); });
        return () => { cancelled = true; };
      }
    }

    try {
      const active = await getActivePlan({ User_Id: userId, Mode: selectedMode });
      if (cancelled) return;

      if (active?.Plan && active?.Id) {
        setPlanData(active.Plan); setDraftPlan(active.Plan);
        setCurrentPlanId(active.Id);
        setSelectedPeriodIndex(active.Current_Period_Index || 0);
        setSelectedDayIndex(new Date().getDay());
        cacheSet(cacheKey, { plan: active.Plan, id: active.Id, periodIndex: active.Current_Period_Index || 0 });
        setLoading(false);
        try {
          const planObj = typeof active.Plan === 'string' ? JSON.parse(active.Plan) : active.Plan;
          if (Array.isArray(planObj?.recommended_resources) && planObj.recommended_resources.length > 0) {
            setRecommendations(planObj.recommended_resources);
          }
        } catch (_) {}
        loadTaskFeedbackForPlan(active.Id).then(fb => { if (!cancelled) setTaskFeedback(fb); });
        return;
      }

      setPlanData(null); setDraftPlan(null); setCurrentPlanId(null);
      let hasExam = false;
      try {
        const cls = await getRecentClassifications({ User_Id: userId, Days: 3650 });
        if (cancelled) return;
        hasExam = Array.isArray(cls) && cls.length > 0;
      } catch (_) {
        hasExam = (user?.examScores || []).length > 0;
      }
      if (!hasExam) {
        setPlanLocked(true); setLockReason('no_exam');
      } else {
        // Try to pre-fill questionnaire focus areas from the latest PDF/document analysis
        try {
          const recentDocs = await getUserDocumentAnalyses({ User_Id: userId, Limit: 1 });
          const latestDoc = (recentDocs?.Results || [])[0];
          if (latestDoc?.Feedback?.Detected_Issues) {
            const SKILL_KEYS = ['grammar', 'vocabulary', 'punctuation', 'spelling', 'writing'];
            const rawIssues = parseJsonField(latestDoc.Feedback.Detected_Issues, []);
            const detected = (Array.isArray(rawIssues) ? rawIssues : [])
              .map(s => (s || '').toLowerCase())
              .filter(s => SKILL_KEYS.includes(s));
            if (!cancelled && detected.length > 0) setSuggestedFocus(detected);
          }
        } catch (_) { /* best-effort — questionnaire still works without it */ }
        setShowQuestionnaire(true);
        getPlanHistory({ User_Id: userId, Limit: 5 }).then(h => { if (!cancelled) setHistory(h || []); }).catch(() => {});
      }
    } catch (e) {
      if (!cancelled) { setError(e.message); setPlanData(null); setDraftPlan(null); }
    }
    finally { if (!cancelled) setLoading(false); }
    return () => { cancelled = true; };
  }, [userId, cacheKey, loadTaskFeedbackForPlan, user]);

  // Don't load the plan until the user has completed the questionnaire
  useEffect(() => {
    if (!userId || showQuestionnaire) return;
    let cancelled = false;
    loadPlan(mode);
    return () => { cancelled = true; };
  }, [userId, mode, loadPlan, showQuestionnaire]);

  // ── derived ───────────────────────────────────────────────────────────────────
  const periods       = useMemo(() => draftPlan?.plan || [], [draftPlan]);
  const currentPeriod = periods[selectedPeriodIndex] || null;
  const days          = currentPeriod?.days || [];

  const selectedDay = useMemo(() => {
    if (!days.length) return null;
    const todayName = DAY_NAMES[selectedDayIndex];
    return days.find(d => (d.day||'').toLowerCase() === todayName.toLowerCase()) || days[selectedDayIndex] || days[0];
  }, [days, selectedDayIndex]);

  const selectedDayArrayIndex = useMemo(() => {
    if (!days.length || !selectedDay) return 0;
    const idx = days.indexOf(selectedDay);
    return idx >= 0 ? idx : 0;
  }, [days, selectedDay]);

  const isTaskDone = useCallback((t) =>
    computeTaskDone(t, taskFeedback[t.task_id] ?? null),
  [taskFeedback]);

  const { allTasks, completedCount, progress } = useMemo(() => {
    const all = [];
    for (const p of periods) for (const d of p.days||[]) all.push(...(d.tasks||[]));
    const done = all.filter(t => isTaskDone(t)).length;
    return { allTasks: all, completedCount: done, progress: all.length ? Math.round(done/all.length*100) : 0 };
  }, [periods, isTaskDone]);

  // 80% completion gate. In MONTHLY mode the "period" the user completes is the
  // WHOLE month (all weeks combined), so the gate counts every task in the plan.
  // In WEEKLY mode it counts only the current period.
  const { periodProgress, canCompletePeriod } = useMemo(() => {
    const periodTasks = mode === 'monthly'
      ? periods.flatMap(p => (p.days || []).flatMap(d => d.tasks || []))
      : (currentPeriod?.days || []).flatMap(d => d.tasks || []);
    const periodDone  = periodTasks.filter(t => isTaskDone(t)).length;
    const pct = periodTasks.length ? Math.round(periodDone / periodTasks.length * 100) : 0;
    return { periodProgress: pct, canCompletePeriod: pct >= 80 };
  }, [mode, periods, currentPeriod, isTaskDone]);

  // ── handlers ──────────────────────────────────────────────────────────────────
  const handleAdapt = async () => {
    const msg = chatInput.trim();
    if (!msg || !draftPlan) return;
    setIsAdapting(true); setChatInput('');
    setChatLog(prev => [...prev, { role: 'user', text: msg }]);
    // Snapshot draftPlan synchronously before any await — user may reset/null it during the API call
    const planSnapshot = draftPlan;
    lastDraftRef.current = planSnapshot;
    const nextDepth = chatDepth + 1;
    setChatDepth(nextDepth);
    checkAndIncrement({ User_Id: userId, Counter: 'adjustments' }).catch(() => {});
    try {
      const res = await adjustPlan({
        User_Id: userId,
        Instruction: msg,
        Current_Plan: planSnapshot,
        Selected_Period_Index: selectedPeriodIndex,
        Selected_Day_Index: selectedDayArrayIndex,
        Target_Day: selectedDay?.day || null,
        Pinned_Task: pinnedTask,
        Chat_Depth: nextDepth,
      });
      if (!res?.Success) throw new Error(res?.Error || 'Adjustment failed');

      const planChanged = !!res.Plan;
      let autoSaved = false;
      if (planChanged) {
        const oldIds = getAllTaskIds(planSnapshot);
        const newIds = getAllTaskIds(res.Plan);
        const addedIds = new Set([...newIds].filter(id => !oldIds.has(id)));
        if (addedIds.size > 0) {
          setHighlightedTaskIds(addedIds);
          setTimeout(() => setHighlightedTaskIds(new Set()), 8000);
        }
        setDraftPlan(res.Plan);

        // Auto-save structural changes so new task IDs are persisted before the user starts them
        const structuralIntents = ['add_task', 'remove_task', 'modify_task'];
        if (structuralIntents.includes(res.Intent) && currentPlanId) {
          try {
            const saveRes = await savePlan({
              User_Id: userId,
              Plan: res.Plan,
              Mode: res.Plan.mode || mode,
              Level: res.Plan.cefr_level || 'A1',
            });
            if (saveRes?.Success) {
              setPlanData(res.Plan);
              const newId = saveRes.Plan_Id || saveRes.Id || currentPlanId;
              if (newId && newId !== currentPlanId) setCurrentPlanId(newId);
              cacheSet(cacheKey, { plan: res.Plan, id: newId || currentPlanId, periodIndex: selectedPeriodIndex });
              autoSaved = true;
            }
          } catch (_) {
            // Auto-save failed silently; user can still save manually
          }
        }
      }

      // Reset pinned task after it's been addressed
      setPinnedTask(null);

      // Reset chat depth if intent changed to a plan-modifying action (new topic)
      const modifyingIntents = ['add_task', 'remove_task', 'modify_task', 'general'];
      if (modifyingIntents.includes(res.Intent)) setChatDepth(0);

      setChatLog(prev => [
        ...prev,
        {
          role:        'bot',
          text:        res.ChatMessage || (planChanged ? (autoSaved ? 'Plan updated and saved.' : 'Plan updated. Review and save when ready.') : 'Done.'),
          diffSummary: planChanged ? res.DiffSummary : null,
          canUndo:     planChanged,
        },
      ]);
    } catch (e) {
      setChatLog(prev => [...prev, { role: 'bot', text: `Error: ${e.message}` }]);
    }
    setIsAdapting(false);
  };

  const handleUndo = () => {
    if (!lastDraftRef.current) return;
    setDraftPlan(lastDraftRef.current);
    lastDraftRef.current = null;
    setChatLog(prev => [
      ...prev.map(m => ({ ...m, canUndo: false })), // remove all undo buttons
      { role: 'bot', text: 'Undone — restored previous plan.' },
    ]);
  };

  const handlePinTask = (task) => {
    setPinnedTask(task);
  };

  const handleSave = async () => {
    if (!draftPlan) return;
    setSaving(true); setError(null);
    const prevPlanData = planData;
    try {
      const res = await savePlan({ User_Id: userId, Plan: draftPlan, Mode: draftPlan.mode||mode, Level: draftPlan.cefr_level||'A1' });
      if (!res?.Success) throw new Error(res?.Error || 'Save failed');
      setPlanData(draftPlan);
      const newId = res.Plan_Id || res.Id || currentPlanId;
      if (newId && newId !== currentPlanId) setCurrentPlanId(newId);
      cacheSet(cacheKey, { plan: draftPlan, id: newId || currentPlanId, periodIndex: selectedPeriodIndex });
      setChatLog(prev => [...prev, { role: 'bot', text: 'Plan saved.' }]);
    } catch (e) {
      // Roll back to the last confirmed server state so UI doesn't show unsaved data as saved
      setPlanData(prevPlanData);
      setDraftPlan(prevPlanData);
      setError(e.message);
      setChatLog(prev => [...prev, { role: 'bot', text: `Save failed: ${e.message}` }]);
    }
    setSaving(false);
  };

  const handleDiscard = () => { setDraftPlan(planData); setChatLog(prev => [...prev, { role: 'bot', text: 'Changes discarded.' }]); };

  const handleMarkDone = async () => {
    setLoading(true); setError(null);
    try {
      const res = await markPlanPeriodDone({ User_Id: userId, Mode: mode });
      if (!res?.Success) throw new Error(res?.Error || 'Failed');
      cacheClear(cacheKey);
      if (res.Plan && res.Status === 'new_plan_generated') {
        // A new exam was available — new plan auto-generated
        const freshActive = await getActivePlan({ User_Id: userId, Mode: mode });
        if (freshActive?.Plan && freshActive?.Id) {
          const fb = await loadTaskFeedbackForPlan(freshActive.Id);
          setPlanData(freshActive.Plan); setDraftPlan(freshActive.Plan);
          setCurrentPlanId(freshActive.Id);
          setSelectedPeriodIndex(freshActive.Current_Period_Index || 0);
          setTaskFeedback(fb);
          cacheSet(cacheKey, { plan: freshActive.Plan, id: freshActive.Id, periodIndex: 0 });
        }
        setPlanLocked(false);
      } else if (res.Status === 'period_advanced') {
        // More periods remain — reload from server to get properly parsed plan
        const freshActive = await getActivePlan({ User_Id: userId, Mode: mode });
        if (freshActive?.Plan && freshActive?.Id) {
          const fb = await loadTaskFeedbackForPlan(freshActive.Id);
          setPlanData(freshActive.Plan); setDraftPlan(freshActive.Plan);
          setCurrentPlanId(freshActive.Id);
          setSelectedPeriodIndex(freshActive.Current_Period_Index || 0);
          setTaskFeedback(fb);
          cacheSet(cacheKey, { plan: freshActive.Plan, id: freshActive.Id, periodIndex: freshActive.Current_Period_Index || 0 });
        }
        setPlanLocked(false);
        invalidatePlan();
      } else {
        // needs_exam: plan fully completed, must take new exam
        setPlanData(null); setDraftPlan(null); setCurrentPlanId(null);
        setPlanLocked(true); setLockReason('needs_exam');
        setInfo(null);
        invalidatePlan();
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // Opens the questionnaire so the user can customise before generating a new plan
  const handleGenerateNew = () => {
    setError(null); setInfo(null);
    setShowQuestionnaire(true);
  };

  // Called when the user finishes the questionnaire and clicks "Generate My Plan"
  const handleQuestComplete = async (answers) => {
    // In renewal mode the mode is pre-set; goal is carried from existing plan
    const newMode = questRenewalMode || answers.mode || mode;
    const finalAnswers = questRenewalMode
      ? { ...answers, mode: newMode, goal: savedGoal || answers.goal }
      : answers;
    setQuestGenerating(true);
    setError(null);
    try {
      setMode(newMode);
      await updateProfile({ preferredPlanMode: newMode }).catch(() => {});

      // Mode switches use the mode_changes quota; first-time generation uses plans quota
      const counterName = questRenewalMode ? 'mode_changes' : 'plans';
      // Check limit first (read-only — does not increment yet)
      const limitCheck = await checkLimit({ User_Id: userId, Counter: counterName }).catch(() => null);
      if (limitCheck && !limitCheck.allowed) {
        const label = questRenewalMode ? 'Mode switch' : 'Plan';
        toast.error(`${label} limit reached (${limitCheck.used}/${limitCheck.limit} this month). Resets on ${nextMonthResetStr()}. Upgrade for more.`);
        setQuestGenerating(false);
        return;
      }

      const res = await generatePlan({
        User_Id: userId,
        Mode: newMode,
        Preferences: JSON.stringify(finalAnswers),
      });

      if (!res?.Success) {
        // no exam yet — close questionnaire and show lock screen
        setShowQuestionnaire(false);
        setQuestRenewalMode(null);
        if (res?.Status === 'no_exam') {
          setPlanLocked(true); setLockReason('no_exam');
        } else {
          toast.error(res?.Error || 'Plan generation failed.');
        }
        return;
      }

      // Plan succeeded — now count the trial against the correct quota
      await checkAndIncrement({ User_Id: userId, Counter: counterName }).catch(() => {});

      setShowQuestionnaire(false);
      setQuestRenewalMode(null);
      if (Array.isArray(res.Recommended_Resources) && res.Recommended_Resources.length > 0) {
        setRecommendations(res.Recommended_Resources);
      }
      invalidatePlan();
      cacheClear(cacheKey);
      // Reload the freshly generated plan
      const freshActive = await getActivePlan({ User_Id: userId, Mode: newMode });
      if (freshActive?.Plan && freshActive?.Id) {
        const fb = await loadTaskFeedbackForPlan(freshActive.Id);
        setPlanData(freshActive.Plan); setDraftPlan(freshActive.Plan);
        setCurrentPlanId(freshActive.Id);
        setSelectedPeriodIndex(freshActive.Current_Period_Index || 0);
        setSelectedDayIndex(new Date().getDay());
        setTaskFeedback(fb);
        cacheSet(cacheKey, { plan: freshActive.Plan, id: freshActive.Id, periodIndex: 0 });
        setPlanLocked(false);
      }
    } catch (e) {
      setShowQuestionnaire(false);
      toast.error(e.message || 'Failed to generate plan.');
    } finally {
      setQuestGenerating(false);
    }
  };

  const handleModeSwitch = (newMode) => {
    if (newMode === mode) return;
    setModeSwitchPending(newMode); // show confirmation dialog first
  };

  const confirmModeSwitch = async (newMode) => {
    setModeSwitchPending(null);

    // Extract saved goal from current plan so the renewal questionnaire can skip it
    const goal = (() => {
      try {
        const p = typeof draftPlan === 'string' ? JSON.parse(draftPlan) : draftPlan;
        return p?.goal || p?.preferences?.goal || '';
      } catch { return ''; }
    })();
    setSavedGoal(goal);
    setQuestRenewalMode(newMode);
    setError(null);
    setShowQuestionnaire(true);
  };



  const handleTaskDone = (taskId, feedbackData, _planId, recs) => {
    setTaskFeedback(prev => ({ ...prev, [taskId]: feedbackData }));
    // Also mark the task status in draftPlan so the card re-renders as done immediately
    setDraftPlan(prev => {
      if (!prev) return prev;
      const updated = JSON.parse(JSON.stringify(prev));
      for (const period of updated.plan || []) {
        for (const day of period.days || []) {
          for (const task of day.tasks || []) {
            if (task.task_id === taskId) task.status = 'submitted';
          }
        }
      }
      return updated;
    });
    if (recs && recs.length > 0) setRecommendations(recs);
    updateTaskStatus(taskId, 'submitted');
    invalidatePlan();
  };

  const handleTaskCancel = (taskId) => {
    setTaskFeedback(prev => { const next = { ...prev }; delete next[taskId]; return next; });
    setDraftPlan(prev => {
      if (!prev) return prev;
      const updated = JSON.parse(JSON.stringify(prev));
      for (const period of updated.plan || []) {
        for (const day of period.days || []) {
          for (const task of day.tasks || []) {
            if (task.task_id === taskId) task.status = 'cancelled';
          }
        }
      }
      return updated;
    });
    updateTaskStatus(taskId, 'cancelled');
    invalidatePlan();
  };

  const handleTaskReset = async (taskId) => {
    if (!currentPlanId) return;
    setTaskFeedback(prev => { const next = { ...prev }; delete next[taskId]; return next; });
    setDraftPlan(prev => {
      if (!prev) return prev;
      const updated = JSON.parse(JSON.stringify(prev));
      for (const period of updated.plan || []) {
        for (const day of period.days || []) {
          for (const task of day.tasks || []) {
            if (task.task_id === taskId) task.status = 'todo';
          }
        }
      }
      return updated;
    });
    resetTask({ User_Id: userId, Plan_Id: currentPlanId, Task_Id: taskId }).catch(() => {});
  };

  // ─────────────────────────────────────────────────────────────────────────────
  if (showQuestionnaire) {
    return (
      <PlanQuestionnaire
        onComplete={handleQuestComplete}
        generating={questGenerating}
        suggestedFocus={suggestedFocus}
        renewalMode={questRenewalMode}
        savedGoal={savedGoal}
      />
    );
  }

  if (loading && !draftPlan) {
    return (
      <PageLayout>
        <div className="space-y-6" data-page="plan">
          <Link to="/main" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
            <ArrowLeft className="w-4 h-4" />Back to Home
          </Link>
          <PlanSkeleton />
        </div>
      </PageLayout>
    );
  }

  return (
    <>
    <PageLayout>
      <div className="space-y-6" data-page="plan">

          <div>
            <Link to="/main" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
              <ArrowLeft className="w-4 h-4" />Back to Home
            </Link>

            <div className={`${glass} p-6`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* Progress ring — only when a plan is loaded */}
                  {!planLocked && draftPlan && (() => {
                    // Today's tasks progress
                    const todayTasks = selectedDay?.tasks || [];
                    const todayDone = todayTasks.filter(t => t.status==='submitted'||t.status==='reviewed'||taskFeedback[t.task_id]).length;
                    const todayPct = todayTasks.length ? todayDone/todayTasks.length : 0;
                    // Current week progress
                    const weekTasks = (currentPeriod?.days||[]).flatMap(d=>d.tasks||[]);
                    const weekDone  = weekTasks.filter(t => t.status==='submitted'||t.status==='reviewed'||taskFeedback[t.task_id]).length;
                    const weekPct   = weekTasks.length ? weekDone/weekTasks.length : 0;
                    // Overall plan progress
                    const overallPct = allTasks.length ? completedCount/allTasks.length : 0;
                    const rings = [
                      { r:30, pct:overallPct, color:'var(--primary)',           label:'Plan'  },
                      { r:22, pct:weekPct,    color:'var(--primary)',            label:'Week'  },
                      { r:14, pct:todayPct,   color:'color-mix(in srgb, var(--primary) 50%, transparent)', label:'Today' },
                    ];
                    return (
                      <div className="relative flex-shrink-0 w-[80px] h-[80px]">
                        <svg width="80" height="80" viewBox="0 0 80 80">
                          {rings.map(({ r, pct, color }) => {
                            const circ = 2*Math.PI*r;
                            return (
                              <g key={r}>
                                <circle cx="40" cy="40" r={r} fill="none" stroke="var(--border)" strokeWidth="5" opacity="0.4" />
                                <circle cx="40" cy="40" r={r} fill="none"
                                  stroke={color} strokeWidth="5" strokeLinecap="round"
                                  strokeDasharray={circ}
                                  strokeDashoffset={circ*(1-pct)}
                                  transform="rotate(-90 40 40)"
                                  style={{ transition:'stroke-dashoffset 0.8s cubic-bezier(0.34,1.56,0.64,1)' }}
                                />
                              </g>
                            );
                          })}
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[11px] font-bold text-foreground">{Math.round(overallPct*100)}%</span>
                        </div>
                      </div>
                    );
                  })()}
                  <div>
                    <h1 className="text-2xl font-bold text-foreground">Your Learning Plan</h1>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {draftPlan?.cefr_level && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold border border-primary/30 bg-primary/10 text-primary">
                          {draftPlan.cefr_level}
                        </span>
                      )}
                      {draftPlan && <span className="text-sm text-muted-foreground">{completedCount}/{allTasks.length} tasks done</span>}
                    </div>
                  </div>
                </div>

                {/* Only show plan controls when a plan is actually active */}
                {!planLocked && draftPlan && (
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Plan type badge + change link */}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-muted/30">
                      <span className="text-xs font-semibold text-foreground capitalize">{mode}</span>
                      <button onClick={() => handleModeSwitch(mode === 'weekly' ? 'monthly' : 'weekly')}
                        className="text-[10px] text-primary hover:underline font-medium leading-none">
                        Change
                      </button>
                    </div>
                    <button onClick={() => loadPlan(mode, true)}
                      className="p-2 rounded-lg border border-border hover:bg-muted transition-colors" title="Refresh plan">
                      <RotateCcw className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <div className="relative group/complete">
                      <button onClick={handleMarkDone} disabled={!canCompletePeriod}
                        className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center gap-1.5">
                        <Zap className="w-4 h-4" />Complete Period
                        {!canCompletePeriod && (
                          <span className="ml-1 text-[10px] font-normal opacity-80">{periodProgress}%</span>
                        )}
                      </button>
                      {!canCompletePeriod && (
                        <div className="absolute bottom-full right-0 mb-2 hidden group-hover/complete:block z-20">
                          <div className="bg-foreground text-background text-[11px] px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
                            Complete {80 - periodProgress}% more tasks to unlock
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {draftPlan && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label:'Overall',   value:`${progress}%`,  sub:`${completedCount}/${allTasks.length} tasks`, icon:BarChart3,   color:'text-primary',     bg:'bg-primary/10'     },
                { label:'Completed', value:completedCount,   sub:`of ${allTasks.length}`,                     icon:CheckCircle, color:'text-primary',     bg:'bg-primary/10'     },
              ].map(({ label, value, sub, icon:Icon, color, bg }) => (
                <div key={label} className="glass-sm rounded-2xl p-4 flex items-center justify-between animate-stagger transition-spring" style={{ borderRadius:'1rem' }}>
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-xl font-bold text-foreground mt-0.5">{value}</p>
                    <p className="text-[10px] text-muted-foreground">{sub}</p>
                  </div>
                  <div className={`p-2.5 rounded-xl ${bg} ${color}`}><Icon className="w-5 h-5" /></div>
                </div>
              ))}

              <div className="glass-sm rounded-2xl p-4 flex items-center justify-between animate-stagger delay-2 transition-spring" style={{ borderRadius:'1rem' }}>
                <div>
                  <p className="text-xs text-muted-foreground">Focus</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(draftPlan.focus_skills || ['general writing']).map((skill) => (
                      <span key={skill} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Target className="w-5 h-5" /></div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
          ) : draftPlan ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedPeriodIndex(p => (p-1+periods.length)%periods.length)}
                    className="p-2 rounded-lg border border-border hover:bg-muted transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-semibold text-foreground flex-1 text-center">
                    {currentPeriod?.period||`Period ${selectedPeriodIndex+1}`}
                    <span className="text-xs text-muted-foreground ml-1">({selectedPeriodIndex+1}/{periods.length})</span>
                  </span>
                  <button onClick={() => setSelectedPeriodIndex(p => (p+1)%periods.length)}
                    className="p-2 rounded-lg border border-border hover:bg-muted transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Week strip calendar */}
                <div className="flex gap-2 pb-1 pt-3 justify-between">
                  {DAY_NAMES.map((day, idx) => {
                    const dayTasks = days.find(d=>(d.day||'').toLowerCase()===day.toLowerCase())?.tasks || days[idx]?.tasks || [];
                    const doneCnt  = dayTasks.filter(t => isTaskDone(t)).length;
                    const allDone  = dayTasks.length > 0 && doneCnt === dayTasks.length;
                    const isToday  = idx === new Date().getDay();
                    const isSelected = selectedDayIndex === idx;
                    return (
                      <button key={day} onClick={() => setSelectedDayIndex(idx)}
                        className={`relative flex flex-col items-center justify-center gap-0.5 rounded-full transition-spring border overflow-visible shrink-0 ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : isToday
                            ? 'glass-sm border-primary/30 text-foreground animate-day-pulse'
                            : 'glass-sm border-border/40 text-foreground hover:border-primary/30'
                        }`}
                        style={{ width: 52, height: 52 }}>
                        {allDone && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-card flex items-center justify-center z-10">
                            <CheckCircle className="w-2.5 h-2.5 text-white" />
                          </span>
                        )}
                        <p className="text-[10px] font-bold leading-none">{day.slice(0,3)}</p>
                        {dayTasks.length === 0 ? (
                          <span className={`text-[8px] leading-none ${isSelected?'text-primary-foreground/60':'text-muted-foreground/50'}`}>rest</span>
                        ) : (
                          <div className="flex gap-0.5 mt-0.5">
                            {Array.from({length: Math.min(dayTasks.length,3)}).map((_,di) => (
                              <span key={di} className={`w-1 h-1 rounded-full ${
                                di < doneCnt ? 'bg-emerald-400' :
                                isSelected ? 'bg-primary-foreground/50' : 'bg-muted-foreground/30'
                              }`} />
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {selectedDay ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">{selectedDay.day}</p>
                      <div className="flex items-center gap-3">
                        {(selectedDay.tasks||[]).length > 0 && (() => {
                          const totalMin = (selectedDay.tasks||[]).reduce((acc, t) => acc + (t.estimated_minutes || 30), 0);
                          return <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />~{totalMin} min today</span>;
                        })()}
                        <p className="text-xs text-muted-foreground">{(selectedDay.tasks||[]).length} tasks</p>
                      </div>
                    </div>
                    {(selectedDay.tasks||[]).length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 px-6 rounded-2xl border border-dashed border-border/60 bg-muted/20 text-center gap-2">
                        <p className="text-[15px] font-semibold text-foreground">Rest &amp; Recharge</p>
                        <p className="text-[13px] text-muted-foreground max-w-xs">No tasks scheduled today. Take a break — consistent rest is part of effective learning.</p>
                      </div>
                    ) : [...(selectedDay.tasks||[])].sort((a, b) => {
                        const doneA = a.status==='submitted'||a.status==='reviewed'||taskFeedback[a.task_id] ? 1 : 0;
                        const doneB = b.status==='submitted'||b.status==='reviewed'||taskFeedback[b.task_id] ? 1 : 0;
                        return doneA - doneB;
                      }).map(task => (
                      <TaskCard
                        key={task.task_id}
                        task={task}
                        feedback={taskFeedback[task.task_id]||null}
                        highlighted={highlightedTaskIds.has(task.task_id)}
                        onOpen={t => { if (!currentPlanId) { setError('Save the plan first to start tasks.'); return; } setModalTask(t); }}
                        onExample={t => setExampleTask(t)}
                        onReset={handleTaskReset}
                        onPin={handlePinTask}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground text-sm py-8">No data for this period.</p>
                )}
              </div>

              <div className="space-y-4">
                <UsageDashboard userId={userId} />

                {recommendations?.length > 0 && (
                  <PlanResourcesPanel resources={recommendations} userId={userId} />
                )}

                <PlanChatPanel
                  chatLog={chatLog}
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  onSend={handleAdapt}
                  onUndo={handleUndo}
                  isAdapting={isAdapting}
                  hasChanges={hasChanges}
                  chatEndRef={chatEndRef}
                  selectedDay={selectedDay}
                  pinnedTask={pinnedTask}
                  onClearPin={() => setPinnedTask(null)}
                />

                <div className="glass-md rounded-2xl p-4 space-y-2" style={{ borderRadius:'1rem' }}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Plan Actions</p>
                  <button onClick={handleSave} disabled={!hasChanges||saving}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-500/10 text-emerald-600 text-sm font-medium disabled:opacity-40 hover:bg-emerald-500/20 transition-spring">
                    <Save className="w-4 h-4" />{saving?'Saving…':'Save Changes'}
                  </button>
                  <button onClick={handleDiscard} disabled={!hasChanges}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-muted/50 text-muted-foreground text-sm font-medium disabled:opacity-40 hover:bg-muted transition-spring">
                    <RotateCcw className="w-4 h-4" />Discard Changes
                  </button>
                  <div className="relative group/complete2">
                    <button onClick={handleMarkDone} disabled={!canCompletePeriod}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-spring">
                      <Zap className="w-4 h-4" />Complete Period
                      {!canCompletePeriod && (
                        <span className="text-[10px] font-normal opacity-70">{periodProgress}%</span>
                      )}
                    </button>
                    {!canCompletePeriod && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/complete2:block z-20">
                        <div className="bg-foreground text-background text-[11px] px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
                          Complete {80 - periodProgress}% more tasks to unlock
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3">
                  <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Click the bulb on any task to see examples. Submitted tasks show full AI feedback — click "View Feedback" to review.
                  </p>
                </div>

                {history.length > 0 && (
                  <div className="glass-sm rounded-2xl p-4" style={{ borderRadius:'1rem' }}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Previous Plans</p>
                    <div className="space-y-1.5">
                      {history.map(h => (
                        <button key={h.Id} onClick={() => setPreviewPlan(h.Plan)}
                          className="w-full text-left px-3 py-2 rounded-xl border border-border/40 bg-background/60 hover:border-primary/40 hover:bg-primary/5 transition-spring text-xs">
                          <span className="font-medium text-foreground">{h.Level}</span>
                          <span className="text-muted-foreground ml-2">{new Date(h.Created_At).toLocaleDateString()}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : planLocked ? (
            <div className="flex flex-col items-center justify-center py-24 text-center animate-spring-in">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 ${lockReason === 'no_exam' ? 'bg-amber-500/10 text-amber-500' : 'bg-primary/10 text-primary'}`}>
                {lockReason === 'no_exam' ? (
                  <AlertCircle className="w-8 h-8" />
                ) : (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 14} strokeDashoffset={0}
                      style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
                    <path d="M10 16.5l4 4 8-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">
                {lockReason === 'no_exam' ? 'No Exam Found' : 'Plan Period Complete!'}
              </h2>
              <p className="text-muted-foreground text-sm max-w-sm mb-8">
                {lockReason === 'no_exam'
                  ? 'You need to take a placement exam first. Your plan will be generated based on your exam results and detected issues.'
                  : 'Great work finishing this period! Take a new exam to assess your progress — your next plan will be tailored to your latest results.'}
              </p>
              <Link to="/exam"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-spring">
                <FileText className="w-4 h-4" />
                {lockReason === 'no_exam' ? 'Take Placement Exam' : 'Take New Exam'}
              </Link>
              {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <Zap className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">No active plan</h2>
              <p className="text-muted-foreground text-sm max-w-sm mb-6">
                Complete a placement exam to get your CEFR level, then come back to generate your plan.
              </p>
              <Link to="/exam" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
                Take Placement Exam
              </Link>
            </div>
          )}
      </div>
    </PageLayout>

      {modalTask && currentPlanId && (
        <TaskWritingModal key={modalTask.task_id} task={modalTask} planId={currentPlanId} userId={userId}
          existingFeedback={taskFeedback[modalTask.task_id]||null}
          onClose={() => setModalTask(null)} onDone={handleTaskDone} onCancel={handleTaskCancel} />
      )}

      {exampleTask && (
        <ExamplesModal task={exampleTask} userId={userId} onClose={() => setExampleTask(null)} />
      )}

      {/* PlanQuestionnaire is rendered above the PageLayout when showQuestionnaire=true */}

      {/* ── Mode switch confirmation ── */}
      {modeSwitchPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl glass-md p-7 animate-spring-in">
            <h2 className="text-lg font-bold text-foreground mb-2">Switch to {modeSwitchPending === 'weekly' ? 'Weekly' : 'Monthly'} Plan?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Your current {mode} plan will be deactivated and replaced. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => confirmModeSwitch(modeSwitchPending)}
                className="flex-1 py-2.5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-spring">
                Switch
              </button>
              <button onClick={() => setModeSwitchPending(null)}
                className="flex-1 py-2.5 rounded-2xl glass-sm text-foreground text-sm font-medium hover:shadow-md transition-spring">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {previewPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Plan Preview</h3>
              <button onClick={() => setPreviewPlan(null)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <p className="text-sm text-muted-foreground">Level: {previewPlan.cefr_level} — {previewPlan.mode}</p>
              {(previewPlan.plan||[]).map((period,i) => (
                <div key={i} className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-sm font-semibold text-foreground mb-2">{period.period||`Period ${i+1}`}</p>
                  <div className="flex flex-wrap gap-1">
                    {(period.days||[]).flatMap(d=>d.tasks||[]).slice(0,6).map((t,j) => (
                      <span key={j} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary">
                        {(t.title||t.type||'Task').slice(0,28)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button onClick={() => setPreviewPlan(null)} className="px-3 py-1.5 rounded-lg border border-border text-sm">Cancel</button>
              <button onClick={() => { setDraftPlan(previewPlan); setPreviewPlan(null); }}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
                Restore This Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}