import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageLayout } from './PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Clock, Award, Send, CheckCircle, AlertCircle, Mail, BookOpen, Lock } from 'lucide-react';
import { generateExamQuestions } from '../graphql/AIService';
import { submitExam } from '../graphql/UserServer';

const EXAM_DURATION_MINUTES = 45;
const EXAM_DURATION_SECONDS = EXAM_DURATION_MINUTES * 60;
const glass = 'rounded-3xl glass-md';

/* Auto-growing textarea mirrors its content in a hidden div */
function AutoTextarea({ value, onChange, disabled, placeholder, className }) {
  const mirrorRef = useRef(null);
  const taRef = useRef(null);
  useEffect(() => {
    if (mirrorRef.current && taRef.current) {
      mirrorRef.current.textContent = value || placeholder || ' ';
      taRef.current.style.height = mirrorRef.current.offsetHeight + 'px';
    }
  }, [value, placeholder]);
  return (
    <div style={{ position: 'relative' }}>
      <div ref={mirrorRef} aria-hidden="true" style={{
        position:'absolute', visibility:'hidden', whiteSpace:'pre-wrap', wordBreak:'break-word',
        padding:'16px', fontSize:'13px', lineHeight:'1.6', minHeight:'144px',
        width:'100%', boxSizing:'border-box',
      }} />
      <textarea ref={taRef} value={value} onChange={onChange} disabled={disabled}
        placeholder={placeholder} className={className}
        style={{ overflow:'hidden', resize:'none', minHeight:'144px' }} />
    </div>
  );
}


const fallbackQuestions = [
  { id: 1, question: 'Write a short paragraph (50-100 words) describing your favorite hobby.', points: 10 },
  { id: 2, question: 'Complete the sentence: "If I could travel anywhere in the world, I would..."', points: 10 },
  { id: 3, question: 'Write a formal email requesting information about an English course.', points: 15 },
  { id: 4, question: 'Describe a recent challenge you faced and how you overcame it. (100-150 words)', points: 15 },
];

function formatTimer(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds || 0));
  return String(Math.floor(safe / 60)).padStart(2, '0') + ':' + String(safe % 60).padStart(2, '0');
}

function parseWordTarget(text) {
  const m = text.match(/\((\d+)[–\-–](\d+)\s*words?\)/i);
  return m ? { min: +m[1], max: +m[2] } : null;
}

// Derive minimum words for a question. Priority:
//  1. Explicit (N–M words) range in the question text → use N
//  2. Keyword signals in the prompt (stem forms cover inflections)
function getMinWords(questionText) {
  const target = parseWordTarget(questionText);
  if (target) return target.min;
  const t = questionText.toLowerCase();
  if (t.includes('essay') || t.includes('discuss') || t.includes('argu')) return 120;
  if (t.includes('email') || t.includes('letter') || t.includes('report') || t.includes('reflec')) return 80;
  if (t.includes('paragraph') || t.includes('describ') || t.includes('explain') ||
      t.includes('blog') || t.includes('review') || t.includes('summar')) return 60;
  if (t.includes('sentence') || t.includes('complete') || t.includes('fill')) return 10;
  return 40;
}

// Derive a sensible target range from the minimum word count.
// Used when the question text has no explicit (N–M words) range.
function deriveWordTarget(minWords) {
  const max = minWords <= 10 ? 30 : Math.round(minWords * 2.5);
  return { min: minWords, max };
}


// Returns { type: 'plan', pct, done, total } | { type: 'rate_limit', msg } | { type: 'gate_error' } | null
function parseBlockingError(msg) {
  if (!msg) return null;
  if (msg.startsWith('PLAN_INCOMPLETE:')) {
    const [, pct, done, total] = msg.split(':');
    return { type: 'plan', pct: Number(pct), done: Number(done), total: Number(total) };
  }
  if (msg === 'GATE_ERROR') {
    return { type: 'gate_error' };
  }
  if (msg.includes('Rate limit exceeded') || msg.includes('Daily exam limit')) {
    return { type: 'rate_limit', msg };
  }
  return null;
}

export function ExamPage() {
  const { user } = useAuth();
  const userId    = useMemo(() => user?.id || null, [user]);
  const userLevel = useMemo(() => user?.level || 'A1', [user]);

  const [examStarted,    setExamStarted]    = useState(false);
  const [answers,        setAnswers]        = useState({});
  const [submitted,      setSubmitted]      = useState(false);
  const [questions,      setQuestions]      = useState(fallbackQuestions);
  const [loadingExam,    setLoadingExam]    = useState(false);
  const [submittingExam, setSubmittingExam] = useState(false);
  const [error,          setError]          = useState('');
  const [confirmSubmit,  setConfirmSubmit]  = useState(false);

  const [attemptId,     setAttemptId]     = useState(null);
  const [expiresAt,     setExpiresAt]     = useState(null);
  const [timeLeft,      setTimeLeft]      = useState(EXAM_DURATION_SECONDS);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  const autoSubmitLockRef = useRef(false);
  const warnedThresholdsRef = useRef(new Set());
  const [timerWarning, setTimerWarning] = useState(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      document.title = 'EWC'; // guarantee reset even on fast navigation
    };
  }, []);

  const handleStartExam = async () => {
    setLoadingExam(true);
    setError('');
    setAutoSubmitted(false);
    autoSubmitLockRef.current = false;

    try {
      if (userId) {
        const res = await generateExamQuestions({ User_Id: userId, Level: userLevel, Count: 4, Duration_Minutes: EXAM_DURATION_MINUTES });

        // Any failure from the API — always block, never fall through to fallback questions
        if (!res?.Success) {
          setError(res?.Error || 'Failed to start exam. Please try again.');
          return;
        }

        if (Array.isArray(res.Questions) && res.Questions.length > 0) {
          setQuestions(res.Questions.map(q => ({ id: q.Id, question: q.Question, points: q.Points })));
          setAttemptId(res.Attempt_Id || null);
          const exp = res.Expires_At ? new Date(res.Expires_At).getTime() : Date.now() + EXAM_DURATION_SECONDS * 1000;
          setExpiresAt(exp);
          setTimeLeft(Math.max(0, Math.floor((exp - Date.now()) / 1000)));
        } else {
          setError(res?.Error || 'Failed to start exam. Please try again.');
          return;
        }
      } else {
        // No authenticated user — block the exam entirely
        setError('You must be signed in to take the exam.');
        return;
      }
      setExamStarted(true);
      setSubmitted(false);
      setAnswers({});
      setConfirmSubmit(false);
    } catch (e) {
      // Any error (network, rate limit, gate) — always block, never start with fallback
      setError(e.message || 'Failed to start exam. Please try again.');
    } finally {
      setLoadingExam(false);
    }
  };

  const handleAnswerChange = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    if (confirmSubmit) setConfirmSubmit(false);
  };

  const handleSubmit = async (isAuto = false) => {
    if (submitted || submittingExam) return;
    if (isAuto && autoSubmitLockRef.current) return;
    if (isAuto) autoSubmitLockRef.current = true;

    if (mountedRef.current) { setSubmittingExam(true); setError(''); }

    try {
      if (!userId) {
        if (mountedRef.current) setError('You must be logged in to submit the exam.');
        return;
      }

      const payloadAnswers = questions.map(q => ({
        Question_Id: String(q.id),
        Answer_Text: answers[q.id] || '',
        Points: Number(q.points),
      }));

      // Always queue — worker handles AI detection, evaluation, and email in the background
      await submitExam({
        User_Id: userId,
        Attempt_Id: attemptId || null,
        Answers: payloadAnswers,
      });

      if (mountedRef.current) {
        setSubmitted(true);
        setAutoSubmitted(Boolean(isAuto));
      }
    } catch (e) {
      if (mountedRef.current) setError(e.message || 'Failed to submit exam');
    } finally {
      if (mountedRef.current) setSubmittingExam(false);
    }
  };

  const handleSubmitClick = () => {
    const belowMin = questions.filter(q => {
      const wc = (answers[q.id] || '').trim().split(/\s+/).filter(w => w.length > 0).length;
      return wc < getMinWords(q.question);
    });
    if (belowMin.length > 0 && !confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }
    setConfirmSubmit(false);
    handleSubmit(false);
  };

  useEffect(() => {
    if (!examStarted || submitted || !expiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((Number(expiresAt) - Date.now()) / 1000));
      setTimeLeft(remaining);

      // Update browser tab title
      document.title = `⏱ ${formatTimer(remaining)} — EWC Exam`;

      // Threshold warnings (only fire once each)
      const thresholds = [
        { secs: 600, msg: '10 minutes remaining', severity: 'info' },
        { secs: 300, msg: '5 minutes remaining — wrap up your answers', severity: 'warning' },
        { secs:  60, msg: '1 minute left! Exam will auto-submit shortly', severity: 'urgent' },
      ];
      for (const { secs, msg, severity } of thresholds) {
        if (remaining <= secs && !warnedThresholdsRef.current.has(secs)) {
          warnedThresholdsRef.current.add(secs);
          setTimerWarning({ msg, severity });
          setTimeout(() => setTimerWarning(null), 8000);
        }
      }

      if (remaining <= 0 && !autoSubmitLockRef.current && !submittingExam && mountedRef.current) {
        autoSubmitLockRef.current = true;
        handleSubmit(true);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      document.title = 'EWC';
    };
  }, [examStarted, submitted, expiresAt, submittingExam]);

  // Reset warned thresholds when a new exam starts
  useEffect(() => {
    if (examStarted) warnedThresholdsRef.current = new Set();
  }, [examStarted]);

  // ─── PRE-EXAM ──────────────────────────────────────────────────────────────
  if (!examStarted) {
    return (
      <PageLayout maxWidth="max-w-4xl">
        <div data-page="exam" className={`${glass} p-8 animate-spring-in`}>
          <div className="flex items-center gap-4 mb-8">
            <div className="w-[68px] h-[68px] rounded-2xl glass-sm border-primary/20 flex items-center justify-center flex-shrink-0">
              <FileText className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55 font-semibold mb-0.5">Writing Assessment</p>
              <h1 className="text-xl font-bold text-foreground">English Writing Exam</h1>
              <p className="text-[13px] text-muted-foreground">Test your skills · track your progress</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
            {[
              { icon: Clock,    label: 'Duration',     value: '45 minutes', sub: 'server enforced'  },
              { icon: Award,    label: 'Total points', value: '50 points',  sub: 'across 4 tasks'   },
              { icon: FileText, label: 'Questions',    value: '4 tasks',    sub: 'writing focused'  },
            ].map(({ icon: Icon, label, value, sub }) => (
              <div key={label} className="flex items-center gap-4 rounded-2xl glass-sm p-4 transition-spring hover:shadow-md">
                <div className="p-2.5 rounded-xl glass-sm flex-shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground/55 uppercase tracking-wide">{label}</p>
                  <p className="text-[14px] font-semibold text-foreground">{value}</p>
                  <p className="text-[11px] text-muted-foreground">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3 rounded-2xl glass-sm border-amber-500/25 bg-amber-500/5 p-4 mb-8">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-foreground mb-0.5">Before you start</p>
              <p className="text-[12px] text-muted-foreground">The server controls exam expiration. When time ends your exam is submitted automatically. Make sure you have 45 uninterrupted minutes.</p>
            </div>
          </div>

          {error && (() => {
            const blocking = parseBlockingError(error);
            if (blocking?.type === 'plan') {
              return (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 p-5 mb-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <p className="text-[13px] font-semibold text-foreground">Exam locked — complete your current plan period first</p>
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    You have completed <span className="font-semibold text-foreground">{blocking.done}/{blocking.total} tasks ({blocking.pct}%)</span> in the current period.
                    You need at least <span className="font-semibold text-amber-600 dark:text-amber-400">80%</span> to unlock the exam.
                  </p>
                  <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                    <div className="h-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-700"
                      style={{ width: `${blocking.pct}%` }} />
                  </div>
                  <Link to="/plan"
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 px-4 py-2 text-[12px] font-semibold text-amber-700 dark:text-amber-300 transition-spring">
                    <BookOpen className="w-3.5 h-3.5" />Go to my plan
                  </Link>
                </div>
              );
            }
            if (blocking?.type === 'rate_limit') {
              return (
                <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 mb-6 flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-semibold text-destructive mb-0.5">Daily exam limit reached</p>
                    <p className="text-[12px] text-muted-foreground">You can take up to 3 exams per day. Come back tomorrow to continue.</p>
                  </div>
                </div>
              );
            }
            if (blocking?.type === 'gate_error') {
              return (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 p-5 mb-6 space-y-2">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <p className="text-[13px] font-semibold text-foreground">Exam locked — finish your current plan period first</p>
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    You must complete at least <span className="font-semibold text-amber-600 dark:text-amber-400">80%</span> of your current plan period before you can take a new exam. Head to your plan, complete the remaining tasks, then come back to start the exam.
                  </p>
                  <Link to="/plan"
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 px-4 py-2 text-[12px] font-semibold text-amber-700 dark:text-amber-300 transition-spring">
                    <BookOpen className="w-3.5 h-3.5" />Go to my plan
                  </Link>
                </div>
              );
            }
            return (
              <div className="flex items-center gap-2 rounded-2xl glass-sm border-destructive/25 bg-destructive/5 px-4 py-3 text-[13px] text-destructive mb-6">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
              </div>
            );
          })()}

          <button onClick={handleStartExam} disabled={loadingExam || Boolean(parseBlockingError(error))}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-[15px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-spring active:scale-[0.98]">
            {loadingExam
              ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Preparing…</>
              : <><Send className="w-4 h-4" />Start Exam</>}
          </button>
        </div>
      </PageLayout>
    );
  }

  // ─── SUBMITTED — check your email screen ─────────────────────────────────
  if (submitted) {
    return (
      <PageLayout maxWidth="max-w-4xl">
        <div data-page="exam" className={`${glass} p-10 animate-spring-in flex flex-col items-center text-center gap-6`}>
          {/* Icon */}
          <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Mail className="w-9 h-9 text-primary" />
          </div>

          {/* Heading */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55 font-semibold mb-1">
              {autoSubmitted ? 'Time limit reached' : 'Exam submitted'}
            </p>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {autoSubmitted ? 'Your exam has been automatically submitted.' : 'Your exam has been received.'}
            </h1>
            <p className="text-[14px] text-muted-foreground max-w-md">
              Our AI pipeline will now assess your writing for authenticity, classify your CEFR proficiency level, and provide detailed linguistic feedback. Your complete results will be delivered to your registered email address.
            </p>
          </div>

          {/* Info card */}
          <div className="w-full max-w-sm rounded-2xl glass-sm border-primary/15 bg-primary/5 px-5 py-4 text-left space-y-2">
            <p className="text-[12px] font-semibold text-primary uppercase tracking-wide">What happens next</p>
            {[
              'Authenticity verification — AI-generated content is screened before evaluation',
              'Linguistic analysis — grammar, vocabulary, and punctuation are assessed per answer',
              'CEFR classification — your proficiency level is determined and saved to your profile',
              'Results delivered — a full report is sent to your email and your learning plan is updated',
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[9px] font-bold text-primary">{i + 1}</span>
                </div>
                <p className="text-[12px] text-muted-foreground">{step}</p>
              </div>
            ))}
          </div>

          {autoSubmitted && (
            <span className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[12px] text-amber-600 dark:text-amber-400">
              <Clock className="w-3.5 h-3.5" />Time ended — exam was automatically submitted
            </span>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
            <Link to="/dashboard"
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90 transition-spring">
              Go to Dashboard
            </Link>
            <button
              onClick={() => {
                setExamStarted(false); setSubmitted(false); setAttemptId(null);
                setExpiresAt(null); setTimeLeft(EXAM_DURATION_SECONDS); setAutoSubmitted(false);
                autoSubmitLockRef.current = false;
              }}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl glass-sm px-5 py-2.5 text-[13px] font-semibold text-foreground hover:shadow-md transition-spring">
              Take another exam
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-2xl glass-sm border-destructive/25 bg-destructive/5 px-4 py-3 text-[13px] text-destructive w-full">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}
        </div>
      </PageLayout>
    );
  }

  // ─── ACTIVE EXAM ──────────────────────────────────────────────────────────
  const isUrgent      = timeLeft <= 5 * 60;
  const timerPct      = Math.max(0, (timeLeft / EXAM_DURATION_SECONDS) * 100);
  const answeredCount = questions.filter(q => (answers[q.id] || '').trim().length > 0).length;

  return (
    <PageLayout maxWidth="max-w-4xl">
      <div data-page="exam" className="space-y-8">

        {/* ── Timer warning banner ────────────────────────────────── */}
        {timerWarning && (
          <div className={`rounded-2xl px-5 py-3 flex items-center gap-3 text-sm font-medium animate-spring-in ${
            timerWarning.severity === 'urgent'
              ? 'bg-destructive/10 border border-destructive/30 text-destructive'
              : timerWarning.severity === 'warning'
              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400'
              : 'bg-primary/10 border border-primary/20 text-primary'
          }`}>
            <Clock className="w-4 h-4 flex-shrink-0" />
            {timerWarning.msg}
          </div>
        )}

        {/* ── Sticky floating header bar ─────────────────────────── */}
        <div className="sticky top-4 z-float glass-md rounded-2xl px-5 py-3 flex items-center gap-6"
          style={{ borderRadius:'1rem' }}>
          {/* Timer */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-sm text-[13px] font-mono font-semibold flex-shrink-0 transition-spring ${
            isUrgent ? 'border-destructive/30 text-destructive' : 'border-primary/20 text-primary'
          }`}>
            <Clock className="w-3.5 h-3.5" />
            {formatTimer(timeLeft)}
          </div>
          {/* Timer drain bar */}
          <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? 'bg-destructive' : 'bg-primary'}`}
              style={{ width:`${timerPct}%` }} />
          </div>
          {/* Progress dots */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {questions.map((q, i) => {
              const wc = (answers[q.id]||'').trim().split(/\s+/).filter(w=>w.length>0).length;
              const met = wc >= getMinWords(q.question);
              return (
                <div key={q.id} className={`rounded-full transition-spring ${
                  met ? 'w-3 h-3 bg-emerald-500' :
                  wc > 0 ? 'w-3 h-3 bg-amber-400' :
                  'w-2.5 h-2.5 bg-border'
                }`} title={`Q${i+1}`} />
              );
            })}
            <span className="text-[11px] text-muted-foreground ml-1">{answeredCount}/{questions.length}</span>
          </div>
          {/* Submit */}
          <button onClick={handleSubmitClick} disabled={submittingExam}
            className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-1.5 text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 transition-spring flex-shrink-0">
            {submittingExam ? <><div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Submitting…</> : <><Send className="w-3.5 h-3.5" />Submit</>}
          </button>
        </div>

        {/* ── Main exam card ─────────────────────────────────────── */}
        <div className={`${glass} p-8`} style={{ borderRadius:'1.5rem' }}>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55 font-semibold mb-1">Writing Assessment</p>
          <h1 className="text-xl font-bold text-foreground mb-1">English Writing Exam</h1>
          <p className="text-[13px] text-muted-foreground mb-8">Answer all questions to the best of your ability</p>

          {error && (
            <div className="flex items-center gap-2 rounded-2xl glass-sm border-destructive/25 bg-destructive/5 px-4 py-3 text-[13px] text-destructive mb-6">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          {/* Questions — individual focused cards */}
          <div className="space-y-5">
            {questions.map((question, index) => {
              const minWords   = getMinWords(question.question);
              const wordTarget = parseWordTarget(question.question) || deriveWordTarget(minWords);
              const wordCount  = (answers[question.id] || '').trim().split(/\s+/).filter(w => w.length > 0).length;
              const meetsMin   = wordCount >= minWords;
              const inRange    = wordTarget ? wordCount >= wordTarget.min && wordCount <= wordTarget.max : null;
              const barPct     = Math.min(100, (wordCount / minWords) * 100);

              return (
                <div key={question.id}
                  className={`glass-sm rounded-2xl p-5 transition-spring animate-stagger delay-${index}`}
                  style={{ borderRadius:'1.25rem' }}>
                  <div className="flex justify-between items-start gap-3 mb-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-bold flex-shrink-0 mt-0.5 glass-sm transition-spring ${
                        wordCount === 0 ? 'text-primary'
                        : meetsMin ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        {meetsMin && wordCount > 0 ? <CheckCircle className="w-4 h-4" /> : index + 1}
                      </div>
                      <p className="text-[14px] text-foreground leading-relaxed">{question.question}</p>
                    </div>
                    <span className="flex-shrink-0 text-[11px] font-semibold text-muted-foreground/60 glass-sm px-3 py-1 rounded-full">
                      {question.points} pts
                    </span>
                  </div>

                  <AutoTextarea
                    value={answers[question.id] || ''}
                    onChange={e => handleAnswerChange(question.id, e.target.value)}
                    className={`w-full p-4 glass-sm rounded-2xl focus:ring-2 focus:ring-primary/25 transition-spring text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none ${
                      wordCount > 0 && !meetsMin ? 'border-amber-500/40' : 'border-white/30 dark:border-white/10'
                    }`}
                    placeholder="Type your answer here…"
                  />

                  {/* Word progress bar */}
                  <div className="mt-3 space-y-1.5">
                    <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-400 ${
                        meetsMin ? 'bg-emerald-500' : wordCount > 0 ? 'bg-amber-400' : 'bg-primary/40'
                      }`} style={{ width:`${barPct}%` }} />
                    </div>
                    <div className="flex items-center justify-between px-0.5">
                      <span className={`text-[11px] font-medium ${
                        wordCount === 0 ? 'text-muted-foreground/60'
                        : meetsMin ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        {wordCount} / {minWords} words min
                        {wordCount > 0 && !meetsMin && ` — ${minWords - wordCount} more`}
                      </span>
                      {wordTarget && (
                        <span className={`text-[11px] font-medium ${
                          inRange ? 'text-emerald-600 dark:text-emerald-400'
                          : wordCount < (wordTarget.min||0) ? 'text-amber-600 dark:text-amber-400'
                          : 'text-destructive'
                        }`}>
                          Target: {wordTarget.min}–{wordTarget.max}
                          {wordCount > 0 && !inRange && (wordCount < wordTarget.min ? ' (too short)' : ' (too long)')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Confirm dialog */}
          {confirmSubmit && (
            <div className="mt-6 flex items-center gap-3 rounded-2xl glass-sm border-amber-500/25 bg-amber-500/5 px-4 py-3 animate-spring-in">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-[13px] text-amber-700 dark:text-amber-300 flex-1">
                {(() => {
                  const belowMin = questions.filter(q => {
                    const wc = (answers[q.id]||'').trim().split(/\s+/).filter(w=>w.length>0).length;
                    return wc < getMinWords(q.question);
                  });
                  const empty = belowMin.filter(q => !(answers[q.id]||'').trim()).length;
                  const short = belowMin.length - empty;
                  const parts = [];
                  if (empty > 0) parts.push(`${empty} unanswered`);
                  if (short > 0) parts.push(`${short} below minimum word count`);
                  return `${parts.join(', ')}. Submit anyway?`;
                })()}
              </p>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setConfirmSubmit(false)}
                  className="px-3 py-1.5 rounded-xl border border-border/40 text-[12px] text-muted-foreground hover:bg-muted/30 transition-spring">
                  Cancel
                </button>
                <button onClick={() => { setConfirmSubmit(false); handleSubmit(false); }}
                  className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 transition-spring">
                  Submit anyway
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
