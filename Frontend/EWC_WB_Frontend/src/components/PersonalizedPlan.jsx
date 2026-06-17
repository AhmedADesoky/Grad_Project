import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PageLayout } from './PageLayout';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, BarChart3, BookOpen, Bot, CheckCircle, ChevronLeft,
  ChevronRight, Clock, ExternalLink, Lightbulb, Loader2, Play,
  RotateCcw, Save, Send, Shield, Target, TrendingUp, Trophy, User,
  X, AlertCircle, Award, FileText, Zap, Edit3, Sparkles,
} from 'lucide-react';
import {
  generatePlan, generateNextPlan, getActivePlan, adjustPlan, savePlan,
  getPlanHistory, markPlanPeriodDone, startTask, submitTaskText,
  getTaskHistory, fetchTaskExamples, getRecentClassifications,
} from '../graphql/AIService';

// ─── constants ────────────────────────────────────────────────────────────────
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const CACHE_KEY_PREFIX = 'ewc_plan_';
const CACHE_TTL_MS = 5 * 60 * 1000;
const glass = 'rounded-3xl border border-border/30 bg-card/80 backdrop-blur-xl';

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

// ─── Exam-style feedback highlighting ─────────────────────────────────────────

function highlightOriginal(original, corrected) {
  if (!original) return null;
  const corrLower = (corrected || '').toLowerCase();
  return original.split(/(\s+)/).map((word, i) => {
    const bare = word.trim().replace(/[.,!?;:]/g, '').toLowerCase();
    if (bare && !corrLower.includes(bare)) {
      return (
        <span key={i} className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded px-0.5 underline decoration-red-400 underline-offset-2">
          {word}
        </span>
      );
    }
    return <span key={i}>{word}</span>;
  });
}

function highlightCorrected(corrected, original) {
  if (!corrected) return null;
  const origLower = (original || '').toLowerCase();
  return corrected.split(/(\s+)/).map((word, i) => {
    const bare = word.trim().replace(/[.,!?;:]/g, '').toLowerCase();
    if (bare && !origLower.includes(bare)) {
      return (
        <span key={i} className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded px-0.5 font-medium">
          {word}
        </span>
      );
    }
    return <span key={i}>{word}</span>;
  });
}

function ExamScoreBar({ label, value, color }) {
  const colorMap = {
    blue:   { text: 'text-blue-500',   bar: 'bg-blue-500'   },
    green:  { text: 'text-emerald-500',bar: 'bg-emerald-500' },
    orange: { text: 'text-orange-500', bar: 'bg-orange-500'  },
    primary:{ text: 'text-primary',    bar: 'bg-primary'     },
  };
  const { text, bar } = colorMap[color] || colorMap.primary;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">{label}</span>
        <span className={`text-sm font-bold ${text}`}>{Number(value || 0).toFixed(2)}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${bar}`} style={{ width: `${value || 0}%` }} />
      </div>
    </div>
  );
}

function TaskFeedbackPanel({ feedback }) {
  if (!feedback) return null;

  const scores   = parseJsonField(feedback.Scores, {});
  const issues   = parseJsonField(feedback.Detected_Issues, []);
  const overall  = getScore(scores, 'overall_score',  'overall');
  const grammar  = getScore(scores, 'grammar_score',  'grammar');
  const vocab    = getScore(scores, 'vocab_score',    'vocab');
  const punct    = getScore(scores, 'punct_score',    'punct');
  const inputTxt = feedback.Input_Text  || '';
  const corrTxt  = feedback.Corrected_Text || '';

  return (
    <div className="mt-4 border-t border-border pt-5 space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Classification</span>
          </div>
          <p className="text-sm font-bold text-foreground">Overall Score</p>
          <p className={`text-2xl font-bold mt-1 ${overall >= 80 ? 'text-emerald-500' : overall >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
            {Number(overall).toFixed(2)}%
          </p>
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Feedback Scores</span>
          </div>
          <div className="space-y-2">
            <ExamScoreBar label="Overall"     value={overall} color="primary" />
            <ExamScoreBar label="Grammar"     value={grammar} color="green"   />
            <ExamScoreBar label="Vocabulary"  value={vocab}   color="blue"    />
            <ExamScoreBar label="Punctuation" value={punct}   color="orange"  />
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

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 mb-3">
            <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Your Answer</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {highlightOriginal(inputTxt, corrTxt)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Corrected Text</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {highlightCorrected(corrTxt, inputTxt)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    submitted:   { label: 'Done',        cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    reviewed:    { label: 'Reviewed',    cls: 'bg-blue-500/10 text-blue-600 border-blue-500/20'         },
    in_progress: { label: 'In Progress', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20'      },
    todo:        { label: 'To Do',       cls: 'bg-muted/60 text-muted-foreground border-border'          },
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
  // Try explicit (N–M words) or (at least N words) in the prompt
  if (task.prompt) {
    const rangeMatch = task.prompt.match(/\((\d+)[–\-–](\d+)\s*words?\)/i);
    if (rangeMatch) return +rangeMatch[1];
    const atLeastMatch = task.prompt.match(/at\s+least\s+(\d+)\s*words?/i);
    if (atLeastMatch) return +atLeastMatch[1];
    const minMatch = task.prompt.match(/minimum\s+(?:of\s+)?(\d+)\s*words?/i);
    if (minMatch) return +minMatch[1];
  }
  // Fall back to estimated_minutes: roughly 4 words per minute of writing time
  const mins = task.estimated_minutes || 30;
  return Math.max(30, Math.round(mins * 4));
}

// ─── TaskWritingModal ─────────────────────────────────────────────────────────
function TaskWritingModal({ task, planId, userId, existingFeedback, onClose, onDone }) {
  const [answer,     setAnswer]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback,   setFeedback]   = useState(existingFeedback || null);
  const [started,    setStarted]    = useState(!!existingFeedback);
  const [expired,    setExpired]    = useState(false);
  const [remaining,  setRemaining]  = useState((task.estimated_minutes || 30) * 60);
  const [err,        setErr]        = useState(null);
  const timerRef = useRef(null);

  const isSubmitted = !!feedback || task.status === 'submitted' || task.status === 'reviewed';

  const handleStart = async () => {
    setErr(null);
    try {
      const res = await startTask({ User_Id: userId, Plan_Id: planId, Task_Id: task.task_id });
      if (!res?.Success) { setErr(res?.Error || 'Failed to start'); return; }
      setStarted(true);
      timerRef.current = setInterval(() =>
        setRemaining(p => { if (p <= 1) { clearInterval(timerRef.current); setExpired(true); return 0; } return p - 1; }), 1000);
    } catch (e) { setErr(e.message); }
  };

  const minWords   = getTaskMinWords(task);
  const wordCount  = answer.trim() ? answer.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
  const meetsMin   = wordCount >= minWords;

  const handleSubmit = async () => {
    if (!answer.trim()) { setErr('Please write your answer first.'); return; }
    if (!meetsMin) { setErr(`Please write at least ${minWords} words (you have ${wordCount}).`); return; }
    setSubmitting(true); setErr(null);
    try {
      const res = await submitTaskText({ User_Id: userId, Plan_Id: planId, Task_Id: task.task_id, Input_Text: answer });
      if (res?.Success && res?.Task) {
        setFeedback(res.Task);
        if (onDone) onDone(task.task_id, res.Task, planId);
        clearInterval(timerRef.current);
      } else setErr(res?.Error || 'Submission failed');
    } catch (e) { setErr(e.message); }
    setSubmitting(false);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);
  const fmtTime = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  const isUrgent = remaining <= 300 && remaining > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10 shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-foreground truncate">{task.title}</h2>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{task.estimated_minutes||30} min</span>
                {(task.skills||[]).length > 0 && <span className="text-xs text-muted-foreground">{task.skills.join(', ')}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {started && !feedback && (
              <span className={`text-sm font-mono px-2.5 py-1 rounded-lg border ${
                isUrgent ? 'text-red-500 border-red-500/30 bg-red-500/10' : 'text-primary border-primary/20 bg-primary/5'}`}>
                {fmtTime(remaining)}
              </span>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {err && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />{err}
            </div>
          )}

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Task Prompt</p>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{task.prompt}</p>
          </div>

          {(task.materials||[]).filter(m=>m?.url).length > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-2 flex items-center gap-1">
                <BookOpen className="w-3 h-3" />Resources
              </p>
              <div className="flex flex-wrap gap-2">
                {task.materials.filter(m=>m?.url).map((m,i) => (
                  <a key={i} href={m.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-all">
                    {m.title||'Resource'}<ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {!isSubmitted && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-primary" />Your Answer
                </p>
                {!started && (
                  <button onClick={handleStart}
                    className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5" />Start Timer
                  </button>
                )}
              </div>
              {started && (
                <>
                  <textarea value={answer} onChange={e=>setAnswer(e.target.value)} disabled={expired}
                    placeholder={expired ? 'Time expired.' : 'Write your answer here…'}
                    rows={8}
                    className={`w-full rounded-xl border bg-white dark:bg-slate-800 p-4 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y disabled:opacity-50 transition-colors ${
                      wordCount > 0 && !meetsMin ? 'border-amber-500/50' : 'border-border'
                    }`} />
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium transition-colors ${
                      wordCount === 0    ? 'text-muted-foreground'
                      : meetsMin        ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      {wordCount} / {minWords} words min
                      {wordCount > 0 && (meetsMin ? ' ✓' : ` — ${minWords - wordCount} more needed`)}
                    </span>
                    <button onClick={handleSubmit} disabled={submitting||!answer.trim()||expired||!meetsMin}
                      className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center gap-2">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Submit
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {feedback && <TaskFeedbackPanel feedback={feedback} />}

          {expired && !feedback && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-center text-destructive text-sm">
              <AlertCircle className="w-5 h-5 mx-auto mb-1" />Time's up — you can no longer submit this task.
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors">
            {feedback ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ExamplesModal ────────────────────────────────────────────────────────────
function ExamplesModal({ task, userId, onClose }) {
  const [examples, setExamples] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [level,    setLevel]    = useState('B1');
  const [tab,      setTab]      = useState('corrections');
  const [err,      setErr]      = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setErr(null);
      try {
        let lvl = 'B1';
        if (userId) {
          const cls = await getRecentClassifications({ User_Id: userId, Days: 30 });
          if (cls?.length) lvl = cls[0].Level || 'B1';
        }
        setLevel(lvl);
        const res = await fetchTaskExamples({ Task_Type: task.type||'writing_task', Skill: task.skills?.[0]||'grammar', Level: lvl, Limit: 3 });
        if (res?.Success) setExamples(res.Examples || []);
        else setErr(res?.Error || 'Failed to load examples');
      } catch (e) { setErr(e.message); }
      setLoading(false);
    })();
  }, []);

  const corrections = examples.filter(e => e.Type === 'error_correction');
  const concepts    = examples.filter(e => e.Type === 'concept');

  function HiRemoved({ wrong, correct }) {
    const corrLower = (correct||'').toLowerCase();
    return wrong.split(/(\s+)/).map((w,i) => {
      const bare = w.trim().replace(/[.,!?;:]/g,'').toLowerCase();
      if (bare && !corrLower.includes(bare))
        return <span key={i} className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded px-0.5 line-through">{w}</span>;
      return <span key={i}>{w}</span>;
    });
  }
  function HiAdded({ correct, wrong }) {
    const wrongLower = (wrong||'').toLowerCase();
    return correct.split(/(\s+)/).map((w,i) => {
      const bare = w.trim().replace(/[.,!?;:]/g,'').toLowerCase();
      if (bare && !wrongLower.includes(bare))
        return <span key={i} className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded px-0.5 font-medium">{w}</span>;
      return <span key={i}>{w}</span>;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10"><Lightbulb className="w-5 h-5 text-amber-500" /></div>
            <div>
              <h2 className="text-base font-bold text-foreground">How to complete: {task.title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Level {level} examples</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="flex gap-1 px-6 pt-4">
          {[['corrections','Error Corrections'],['concepts','Writing Concepts']].map(([id,label]) => (
            <button key={id} onClick={()=>setTab(id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab===id?'bg-primary text-primary-foreground':'text-muted-foreground hover:bg-muted'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          : err ? <div className="text-center py-8 text-destructive text-sm">{err}</div>
          : tab === 'corrections' ? (
            corrections.length === 0
              ? <p className="text-center py-8 text-muted-foreground text-sm">No correction examples for this level.</p>
              : corrections.map((ex,i) => (
                <div key={i} className="rounded-xl border border-border bg-muted/10 p-5 space-y-3">
                  <span className="text-xs font-bold text-primary">Example {i+1} — {ex.Source}</span>
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                    <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Common Mistake</p>
                    <p className="text-sm text-foreground leading-relaxed"><HiRemoved wrong={ex.Wrong||''} correct={ex.Correct||''} /></p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-1.5 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Corrected</p>
                    <p className="text-sm text-foreground leading-relaxed"><HiAdded correct={ex.Correct||''} wrong={ex.Wrong||''} /></p>
                  </div>
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                    <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1.5">Why?</p>
                    <p className="text-sm text-foreground">{ex.Explanation}</p>
                  </div>
                  {ex.Url && ex.Url !== '#' && (
                    <a href={ex.Url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      Read more from {ex.Source}<ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))
          ) : (
            concepts.length === 0
              ? <p className="text-center py-8 text-muted-foreground text-sm">No concept guides for this level.</p>
              : concepts.map((ex,i) => (
                <div key={i} className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                  <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-2 flex items-center gap-1"><BookOpen className="w-3 h-3" />{ex.Source}</p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{ex.Content}</p>
                  {ex.Url && ex.Url !== '#' && (
                    <a href={ex.Url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-3">
                      Full article<ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))
          )}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1.5">Your Task</p>
            <p className="text-sm text-foreground">{task.prompt}</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
            Got it — start writing
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Skill border helper ─────────────────────────────────────────────────────
function getSkillBorderClass(task) {
  const t = ((task.type||'') + (task.skills||[]).join(' ')).toLowerCase();
  if (t.includes('grammar')) return 'skill-border-grammar';
  if (t.includes('vocab'))   return 'skill-border-vocab';
  if (t.includes('punct'))   return 'skill-border-punct';
  if (t.includes('writing')) return 'skill-border-writing';
  return 'skill-border-default';
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────
function TaskCard({ task, feedback, onOpen, onExample }) {
  const [expanded, setExpanded] = useState(false);
  const isDone = task.status === 'submitted' || task.status === 'reviewed' || !!feedback;
  const borderCls = getSkillBorderClass(task);

  return (
    <div className={`glass-sm rounded-xl overflow-hidden transition-spring ${borderCls} ${
      isDone ? 'opacity-75' : 'hover:opacity-100'}`}
      style={{ borderRadius:'0.875rem', paddingLeft:0 }}>

      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-1.5">
            <StatusBadge status={feedback ? 'submitted' : task.status} />
            {task.type && <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{task.type.replace(/_/g,' ')}</span>}
            <span className="text-[10px] text-muted-foreground">{task.estimated_minutes||30} min</span>
          </div>
          <h4 className={`font-semibold text-sm leading-snug ${isDone ? 'text-muted-foreground line-through decoration-1' : 'text-foreground'}`}>{task.title}</h4>
          {task.prompt && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.prompt}</p>}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => onExample(task)} title="See examples"
            className="p-2 rounded-lg bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-spring">
            <Lightbulb className="w-4 h-4" />
          </button>
          {isDone ? (
            <button onClick={() => setExpanded(v => !v)}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-xs font-semibold hover:bg-emerald-500/20 transition-spring flex items-center gap-1">
              <Award className="w-3.5 h-3.5" />{expanded ? 'Hide' : 'View Feedback'}
            </button>
          ) : (
            <button onClick={() => onOpen(task)}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-spring flex items-center gap-1.5">
              <Play className="w-3.5 h-3.5" />Start
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

// ─── PlanChatPanel ────────────────────────────────────────────────────────────
function PlanChatPanel({ chatLog, chatInput, setChatInput, onSend, isAdapting, hasChanges, chatEndRef, selectedDay }) {
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
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/40">
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
            <Bot style={{ width:18, height:18, color:'var(--primary)' }} />
          </div>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-card animate-day-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-none">Plan Assistant</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isAdapting ? 'Thinking…' : 'Ask to adjust tasks or materials'}
          </p>
        </div>
        {hasChanges && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 font-semibold shrink-0 animate-spring-pop">
            Unsaved
          </span>
        )}
      </div>

      {/* Messages — iMessage style */}
      <div className="overflow-y-auto px-4 py-3 flex flex-col gap-2" style={{ minHeight:220, maxHeight:300 }}>
        {chatLog.map((m, i) => (
          <div key={i} className={`flex gap-2 items-end animate-stagger delay-${Math.min(i,6)} ${m.role==='user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'bot' && (
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 mb-0.5">
                <Bot style={{ width:11, height:11, color:'var(--primary)' }} />
              </div>
            )}
            <div className={m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot'}>
              {m.text}
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
          <div className="flex gap-2 items-end justify-start animate-spring-in">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
              <Bot style={{ width:11, height:11, color:'var(--primary)' }} />
            </div>
            <div className="chat-bubble-bot flex items-center gap-1.5 py-3">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-typing-dot" style={{ animationDelay:'0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-typing-dot" style={{ animationDelay:'200ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-typing-dot" style={{ animationDelay:'400ms' }} />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-border/40 space-y-2 bg-background/30">
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
            placeholder="Adjust your plan…"
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
  const { user }        = useAuth();
  const [mode,                setMode]                = useState('weekly');
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
  const [history,             setHistory]             = useState([]);
  const [previewPlan,         setPreviewPlan]         = useState(null);
  const [modalTask,           setModalTask]           = useState(null);
  const [exampleTask,         setExampleTask]         = useState(null);

  const [chatInput,    setChatInput]    = useState('');
  const [chatLog,      setChatLog]      = useState([
    { role: 'bot', text: 'Hi! Tell me how to adjust your plan — e.g. "Add a grammar task on Tuesday" or "Make this week easier".' }
  ]);
  const [isAdapting,   setIsAdapting]   = useState(false);
  const chatEndRef = useRef(null);

  const userId   = user?.id || user?._id || user?.User_Id || user?.user_id || '';
  const cacheKey = `${CACHE_KEY_PREFIX}${userId}_${mode}`;
  const hasChanges = !!draftPlan && JSON.stringify(draftPlan) !== JSON.stringify(planData);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatLog]);

  const loadTaskFeedbackForPlan = useCallback(async (planId) => {
    if (!userId || !planId) return {};
    try {
      const items = await getTaskHistory({ User_Id: userId, Plan_Id: planId, Limit: 200 });
      return Object.fromEntries((items || []).map(t => [t.Task_Id, t]));
    } catch { return {}; }
  }, [userId]);

  const loadPlan = useCallback(async (selectedMode, forceRefresh = false) => {
    if (!userId) return;
    setLoading(true); setError(null); setInfo(null);

    if (!forceRefresh) {
      const cached = cacheGet(cacheKey);
      if (cached && cached.plan && cached.id) {
        setPlanData(cached.plan); setDraftPlan(cached.plan);
        setCurrentPlanId(cached.id);
        setSelectedPeriodIndex(cached.periodIndex || 0);
        setSelectedDayIndex(new Date().getDay());
        // Also load feedback for this plan ID
        const fb = await loadTaskFeedbackForPlan(cached.id);
        setTaskFeedback(fb);
        setLoading(false);
        return;
      }
    }

    try {
      const active = await getActivePlan({ User_Id: userId, Mode: selectedMode });
      if (active?.Plan && active?.Id) {
        const fb = await loadTaskFeedbackForPlan(active.Id);
        setPlanData(active.Plan); setDraftPlan(active.Plan);
        setCurrentPlanId(active.Id);
        setSelectedPeriodIndex(active.Current_Period_Index || 0);
        setSelectedDayIndex(new Date().getDay());
        setTaskFeedback(fb);
        cacheSet(cacheKey, { plan: active.Plan, id: active.Id, periodIndex: active.Current_Period_Index || 0 });
        return;
      }

      const payload = await generateNextPlan({ User_Id: userId, Mode: selectedMode });
      if (!payload?.Success) throw new Error(payload?.Error || 'Failed to load plan');
      
      if (payload.Plan) {
        const freshActive = await getActivePlan({ User_Id: userId, Mode: selectedMode });
        if (freshActive?.Plan && freshActive?.Id) {
          const fb = await loadTaskFeedbackForPlan(freshActive.Id);
          setPlanData(freshActive.Plan); setDraftPlan(freshActive.Plan);
          setCurrentPlanId(freshActive.Id);
          setSelectedPeriodIndex(freshActive.Current_Period_Index || 0);
          setTaskFeedback(fb);
          cacheSet(cacheKey, { plan: freshActive.Plan, id: freshActive.Id, periodIndex: freshActive.Current_Period_Index || 0 });
        } else {
          setPlanData(payload.Plan); setDraftPlan(payload.Plan);
          setCurrentPlanId(null);
        }
        setSelectedDayIndex(new Date().getDay());
      } else {
        setInfo('Plan completed. Take an exam to update your level and return for a new plan.');
        setPlanData(null); setDraftPlan(null); setCurrentPlanId(null);
      }
      getPlanHistory({ User_Id: userId, Limit: 5 }).then(h => setHistory(h || [])).catch(() => {});
    } catch (e) { setError(e.message); setPlanData(null); setDraftPlan(null); }
    finally { setLoading(false); }
  }, [userId, cacheKey, loadTaskFeedbackForPlan]);

  useEffect(() => { if (userId) loadPlan(mode); }, [userId, mode, loadPlan]);

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

  const { allTasks, completedCount, progress } = useMemo(() => {
    const all = [];
    for (const p of periods) for (const d of p.days||[]) all.push(...(d.tasks||[]));
    const done = all.filter(t => t.status==='submitted'||t.status==='reviewed'||taskFeedback[t.task_id]).length;
    return { allTasks: all, completedCount: done, progress: all.length ? Math.round(done/all.length*100) : 0 };
  }, [periods, taskFeedback]);

  // ── handlers ──────────────────────────────────────────────────────────────────
  const handleAdapt = async () => {
    const msg = chatInput.trim();
    if (!msg || !draftPlan) return;
    setIsAdapting(true); setChatInput('');
    setChatLog(prev => [...prev, { role: 'user', text: msg }]);
    try {
      const res = await adjustPlan({ User_Id: userId, Instruction: msg, Current_Plan: draftPlan, Selected_Period_Index: selectedPeriodIndex, Selected_Day_Index: selectedDayArrayIndex });
      if (!res?.Success) throw new Error(res?.Error || 'Adjustment failed');
      setDraftPlan(res.Plan);
      setChatLog(prev => [...prev, { role: 'bot', text: 'Plan updated. Review and save when ready.' }]);
    } catch (e) { setChatLog(prev => [...prev, { role: 'bot', text: `Error: ${e.message}` }]); }
    setIsAdapting(false);
  };

  const handleSave = async () => {
    if (!draftPlan) return;
    setSaving(true); setError(null);
    try {
      const res = await savePlan({ User_Id: userId, Plan: draftPlan, Mode: draftPlan.mode||mode, Level: draftPlan.cefr_level||'A1' });
      if (!res?.Success) throw new Error(res?.Error || 'Save failed');
      setPlanData(draftPlan);
      // After saving, refresh to get the new plan ID
      const freshActive = await getActivePlan({ User_Id: userId, Mode: mode });
      if (freshActive?.Id) {
        setCurrentPlanId(freshActive.Id);
        const fb = await loadTaskFeedbackForPlan(freshActive.Id);
        setTaskFeedback(fb);
        cacheSet(cacheKey, { plan: freshActive.Plan, id: freshActive.Id, periodIndex: freshActive.Current_Period_Index || 0 });
      }
      cacheClear(cacheKey);
      setChatLog(prev => [...prev, { role: 'bot', text: 'Plan saved.' }]);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleDiscard = () => { setDraftPlan(planData); setChatLog(prev => [...prev, { role: 'bot', text: 'Changes discarded.' }]); };

  const handleMarkDone = async () => {
    setLoading(true); setError(null);
    try {
      const res = await markPlanPeriodDone({ User_Id: userId, Mode: mode });
      if (!res?.Success) throw new Error(res?.Error || 'Failed');
      cacheClear(cacheKey);
      if (res.Plan) {
        setPlanData(res.Plan); setDraftPlan(res.Plan);
        setSelectedPeriodIndex(res.Plan.current_period_index||0);
        // Refresh to get new plan ID
        const freshActive = await getActivePlan({ User_Id: userId, Mode: mode });
        if (freshActive?.Id) {
          setCurrentPlanId(freshActive.Id);
          const fb = await loadTaskFeedbackForPlan(freshActive.Id);
          setTaskFeedback(fb);
        }
      } else {
        setPlanData(null); setDraftPlan(null); setInfo('Plan completed!');
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleGenerateNew = async () => {
    setGeneratingNew(true); setError(null); setInfo(null);
    try {
      const res = await generatePlan({ User_Id: userId, Mode: mode, Save_To_Database: true });
      if (!res?.Success) throw new Error(res?.Error || 'Failed to generate plan');
      const freshActive = await getActivePlan({ User_Id: userId, Mode: mode });
      if (freshActive?.Plan && freshActive?.Id) {
        const fb = await loadTaskFeedbackForPlan(freshActive.Id);
        setPlanData(freshActive.Plan); setDraftPlan(freshActive.Plan);
        setCurrentPlanId(freshActive.Id);
        setSelectedPeriodIndex(freshActive.Current_Period_Index || 0);
        setTaskFeedback(fb);
        cacheSet(cacheKey, { plan: freshActive.Plan, id: freshActive.Id, periodIndex: 0 });
        setSelectedDayIndex(new Date().getDay());
      }
    } catch (e) { setError(e.message); }
    setGeneratingNew(false);
  };

  const handleTaskDone = async (taskId, feedbackData, planId) => {
    setTaskFeedback(prev => ({ ...prev, [taskId]: feedbackData }));
    
    // Update draft plan status
    setDraftPlan(prev => {
      if (!prev) return prev;
      const copy = JSON.parse(JSON.stringify(prev));
      for (const p of copy.plan||[]) {
        for (const d of p.days||[]) {
          const t = (d.tasks||[]).find(t => t.task_id === taskId);
          if (t) { t.status = 'submitted'; return copy; }
        }
      }
      return copy;
    });
    
    // Update cache with new feedback
    const cached = cacheGet(cacheKey);
    if (cached && cached.id === planId) {
      const updatedFeedback = { ...taskFeedback, [taskId]: feedbackData };
      cacheSet(cacheKey, { ...cached, feedback: updatedFeedback });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
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
                  {/* Progress ring */}
                  {draftPlan && (() => {
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
                      { r:30, pct:overallPct, color:'var(--primary)',  label:'Plan' },
                      { r:22, pct:weekPct,    color:'#10B981',          label:'Week' },
                      { r:14, pct:todayPct,   color:'#F59E0B',          label:'Today' },
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

                <div className="flex items-center gap-2.5 flex-wrap">
                  <ModePillSelector value={mode} onChange={val => setMode(val)} />
                  <button onClick={() => loadPlan(mode, true)}
                    className="p-2 rounded-lg border border-border hover:bg-muted transition-colors" title="Refresh plan">
                    <RotateCcw className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button onClick={handleMarkDone}
                    className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5">
                    <Zap className="w-4 h-4" />Complete Period
                  </button>
                </div>
              </div>
            </div>
          </div>

          {draftPlan && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label:'Overall',   value:`${progress}%`,  sub:`${completedCount}/${allTasks.length} tasks`, icon:BarChart3,   color:'text-primary',     bg:'bg-primary/10'     },
                { label:'Completed', value:completedCount,   sub:`of ${allTasks.length}`,                     icon:CheckCircle, color:'text-emerald-500', bg:'bg-emerald-500/10' },
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
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500"><Target className="w-5 h-5" /></div>
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
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {DAY_NAMES.map((day, idx) => {
                    const dayTasks = days.find(d=>(d.day||'').toLowerCase()===day.toLowerCase())?.tasks || days[idx]?.tasks || [];
                    const doneCnt  = dayTasks.filter(t => t.status==='submitted'||t.status==='reviewed'||taskFeedback[t.task_id]).length;
                    const allDone  = dayTasks.length > 0 && doneCnt === dayTasks.length;
                    const isToday  = idx === new Date().getDay();
                    const isSelected = selectedDayIndex === idx;
                    return (
                      <button key={day} onClick={() => setSelectedDayIndex(idx)}
                        className={`relative flex-shrink-0 flex flex-col items-center gap-1 rounded-2xl px-3 py-3 min-w-[52px] transition-spring border ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : isToday
                            ? 'glass-sm border-primary/30 text-foreground animate-day-pulse'
                            : 'glass-sm border-border/40 text-foreground hover:border-primary/30'
                        }`}>
                        {allDone && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-card flex items-center justify-center">
                            <CheckCircle className="w-2.5 h-2.5 text-white" />
                          </span>
                        )}
                        <p className="text-[11px] font-bold">{day.slice(0,3)}</p>
                        {dayTasks.length === 0 ? (
                          <span className={`text-[9px] ${isSelected?'text-primary-foreground/60':'text-muted-foreground/50'}`}>rest</span>
                        ) : (
                          <div className="flex gap-0.5">
                            {Array.from({length: Math.min(dayTasks.length,3)}).map((_,di) => (
                              <span key={di} className={`w-1.5 h-1.5 rounded-full ${
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
                      <div className="text-center py-10 rounded-xl border border-dashed border-border text-muted-foreground text-sm">
                        No tasks today. Rest day!
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
                        onOpen={t => { if (!currentPlanId) { setError('Save the plan first to start tasks.'); return; } setModalTask(t); }}
                        onExample={t => setExampleTask(t)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground text-sm py-8">No data for this period.</p>
                )}
              </div>

              <div className="space-y-4">
                <PlanChatPanel
                  chatLog={chatLog}
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  onSend={handleAdapt}
                  isAdapting={isAdapting}
                  hasChanges={hasChanges}
                  chatEndRef={chatEndRef}
                  selectedDay={selectedDay}
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
                  <button onClick={handleMarkDone}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-spring">
                    <Zap className="w-4 h-4" />Complete Period
                  </button>
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
          ) : info ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 14} strokeDashoffset={0}
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
                  <path d="M10 16.5l4 4 8-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Plan Completed!</h2>
              <p className="text-muted-foreground text-sm max-w-sm mb-8">
                Great work finishing your plan. You can generate a new plan now, or take an exam first to update your level.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleGenerateNew}
                  disabled={generatingNew}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {generatingNew ? (
                    <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" /></svg>Generating…</>
                  ) : (
                    <><Zap className="w-4 h-4" />Generate New Plan</>
                  )}
                </button>
                <Link to="/exam" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm font-semibold hover:border-primary/50 transition-colors">
                  Take Exam First
                </Link>
              </div>
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
        <TaskWritingModal task={modalTask} planId={currentPlanId} userId={userId}
          existingFeedback={taskFeedback[modalTask.task_id]||null}
          onClose={() => setModalTask(null)} onDone={handleTaskDone} />
      )}

      {exampleTask && (
        <ExamplesModal task={exampleTask} userId={userId} onClose={() => setExampleTask(null)} />
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