import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageLayout } from './PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Clock, Award, Send, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { generateExamQuestions, evaluateExam, getRecentClassifications } from '../graphql/AIService';
import { addExamScore } from '../graphql/UserServer';

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

/* Confetti burst on pass */
function Confetti() {
  const pieces = useMemo(() => {
    const colors = ['#4F46E5','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4'];
    return Array.from({ length: 24 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      color: colors[i % colors.length],
      delay: `${Math.random() * 0.8}s`,
      duration: `${1.2 + Math.random() * 0.8}s`,
    }));
  }, []);
  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none', borderRadius:'inherit' }}>
      {pieces.map(p => (
        <div key={p.id} className="confetti-piece" style={{
          left: p.left, top: '-12px',
          background: p.color,
          animationDelay: p.delay,
          animationDuration: p.duration,
        }} />
      ))}
    </div>
  );
}

/* Animated score counter ring */
function ScoreRing({ score, passed }) {
  const [displayed, setDisplayed] = useState(0);
  const r = 54; const circ = 2 * Math.PI * r;
  useEffect(() => {
    let start = null; const target = Math.round(score);
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / 1200, 1);
      setDisplayed(Math.round(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [score]);
  const offset = circ * (1 - displayed / 100);
  return (
    <div style={{ position:'relative', width:140, height:140, flexShrink:0 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle cx="70" cy="70" r={r} fill="none"
          stroke={passed ? '#10B981' : '#F59E0B'} strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 70 70)"
          style={{ transition:'stroke-dashoffset 0.05s linear' }}
        />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontSize:'2rem', fontWeight:700, color: passed ? '#10B981' : '#F59E0B', lineHeight:1 }}>{displayed}</span>
        <span style={{ fontSize:'11px', color:'var(--muted-foreground)', marginTop:2 }}>/ 100</span>
      </div>
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
//  2. Keyword signals in the prompt
function getMinWords(questionText) {
  const target = parseWordTarget(questionText);
  if (target) return target.min;
  const t = questionText.toLowerCase();
  if (t.includes('essay') || t.includes('discuss') || t.includes('argue')) return 120;
  if (t.includes('paragraph') || t.includes('describe') || t.includes('explain')) return 60;
  if (t.includes('email') || t.includes('letter') || t.includes('report')) return 80;
  if (t.includes('sentence') || t.includes('complete') || t.includes('fill')) return 10;
  return 40; // default for open-ended short-answer
}

function getEvalScore(ev, ...keys) {
  if (!ev) return 0;
  for (const k of keys) {
    const v = ev[k] ?? ev?.Scores?.[k] ?? ev?.Feedback?.Scores?.[k];
    if (v != null) return Math.round(Number(v));
  }
  return 0;
}

function ScoreBar({ label, value, bar, text }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[12px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-semibold ${text}`}>{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${bar}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ExamPage() {
  const { user } = useAuth();
  const userId    = useMemo(() => user?.id || null, [user]);
  const userLevel = useMemo(() => user?.level || 'A1', [user]);

  const [examStarted,    setExamStarted]    = useState(false);
  const [answers,        setAnswers]        = useState({});
  const [submitted,      setSubmitted]      = useState(false);
  const [score,          setScore]          = useState(0);
  const [questions,      setQuestions]      = useState(fallbackQuestions);
  const [loadingExam,    setLoadingExam]    = useState(false);
  const [submittingExam, setSubmittingExam] = useState(false);
  const [error,          setError]          = useState('');
  const [evaluation,     setEvaluation]     = useState(null);
  const [confirmSubmit,  setConfirmSubmit]  = useState(false);
  const [expandedReview, setExpandedReview] = useState({});

  const [attemptId,     setAttemptId]     = useState(null);
  const [expiresAt,     setExpiresAt]     = useState(null);
  const [timeLeft,      setTimeLeft]      = useState(EXAM_DURATION_SECONDS);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  const autoSubmitLockRef = useRef(false);

  const handleStartExam = async () => {
    setLoadingExam(true);
    setError('');
    setAutoSubmitted(false);
    autoSubmitLockRef.current = false;

    try {
      if (userId) {
        const res = await generateExamQuestions({ User_Id: userId, Level: userLevel, Count: 4, Duration_Minutes: EXAM_DURATION_MINUTES });
        if (res?.Success && Array.isArray(res.Questions) && res.Questions.length > 0) {
          setQuestions(res.Questions.map(q => ({ id: q.Id, question: q.Question, points: q.Points })));
          setAttemptId(res.Attempt_Id || null);
          const exp = res.Expires_At ? new Date(res.Expires_At).getTime() : Date.now() + EXAM_DURATION_SECONDS * 1000;
          setExpiresAt(exp);
          setTimeLeft(Math.max(0, Math.floor((exp - Date.now()) / 1000)));
        } else {
          setQuestions(fallbackQuestions);
          setAttemptId(null);
          const localExp = Date.now() + EXAM_DURATION_SECONDS * 1000;
          setExpiresAt(localExp);
          setTimeLeft(EXAM_DURATION_SECONDS);
          if (res?.Error) setError(res.Error);
        }
      } else {
        setQuestions(fallbackQuestions);
        setAttemptId(null);
        const localExp = Date.now() + EXAM_DURATION_SECONDS * 1000;
        setExpiresAt(localExp);
        setTimeLeft(EXAM_DURATION_SECONDS);
      }
      setExamStarted(true);
      setSubmitted(false);
      setAnswers({});
      setScore(0);
      setEvaluation(null);
      setConfirmSubmit(false);
      setExpandedReview({});
    } catch (e) {
      setQuestions(fallbackQuestions);
      setAttemptId(null);
      const localExp = Date.now() + EXAM_DURATION_SECONDS * 1000;
      setExpiresAt(localExp);
      setTimeLeft(EXAM_DURATION_SECONDS);
      setError(e.message || 'Failed to start exam, using fallback questions');
      setExamStarted(true);
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

    setSubmittingExam(true);
    setError('');

    try {
      const payloadAnswers = questions.map(q => ({
        Question_Id: q.id,
        Answer_Text: answers[q.id] || '',
        Points: q.points,
      }));

      const canSaveServer = Boolean(userId && attemptId);
      const result = await evaluateExam({
        User_Id: userId || 'anonymous_user',
        Attempt_Id: attemptId || null,
        Answers: payloadAnswers,
        Save_To_Database: canSaveServer,
      });

      if (!result?.Success) throw new Error(result?.Error || 'Exam evaluation failed');

      const percentage = Math.round(Number(result.Percentage || 0));
      setScore(percentage);
      setSubmitted(true);
      setEvaluation(result);
      setAutoSubmitted(Boolean(result.Auto_Submitted || isAuto));

      if (userId && canSaveServer) {
        const recentClassifications = await getRecentClassifications({ User_Id: userId, Days: 7 });
        const dbLevel = recentClassifications?.[0]?.Level || result?.Final_Level || userLevel;
        await addExamScore({ User_Id: userId, Score: percentage, Level: dbLevel });
      }

      if (userId && !canSaveServer) {
        setError('Exam was evaluated, but server attempt was missing so result was not saved to analytics.');
      }
    } catch (e) {
      setError(e.message || 'Failed to submit exam');
    } finally {
      setSubmittingExam(false);
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
      if (remaining <= 0 && !autoSubmitLockRef.current && !submittingExam) {
        autoSubmitLockRef.current = true;
        handleSubmit(true);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [examStarted, submitted, expiresAt, submittingExam]);

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

          {error && (
            <div className="flex items-center gap-2 rounded-2xl glass-sm border-destructive/25 bg-destructive/5 px-4 py-3 text-[13px] text-destructive mb-6">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          <button onClick={handleStartExam} disabled={loadingExam}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-[15px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-spring active:scale-[0.98]">
            {loadingExam
              ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Preparing…</>
              : <><Send className="w-4 h-4" />Start Exam</>}
          </button>
        </div>
      </PageLayout>
    );
  }

  // ─── RESULTS ──────────────────────────────────────────────────────────────
  if (submitted) {
    const passed   = score >= 70;
    const grammar  = getEvalScore(evaluation, 'Grammar_Score',  'grammar_score',  'grammar');
    const vocab    = getEvalScore(evaluation, 'Vocab_Score',    'vocab_score',    'vocab');
    const punct    = getEvalScore(evaluation, 'Punct_Score',    'punct_score',    'punct');
    const hasSkills = grammar > 0 || vocab > 0 || punct > 0;
    const C = 2 * Math.PI * 38;

    return (
      <PageLayout maxWidth="max-w-4xl">
        <div data-page="exam" className="space-y-4">
          {/* Score card with confetti + animated ring */}
          <div className={`${glass} p-8 overflow-hidden relative animate-spring-in`} style={{ borderRadius:'1.5rem' }}>
            {passed && <Confetti />}
            <div className="flex flex-col sm:flex-row items-center gap-8 relative">
              <ScoreRing score={score} passed={passed} />

              <div className="flex-1 text-center sm:text-left">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55 font-semibold mb-1">Exam completed</p>
                <h1 className="text-xl font-bold text-foreground mb-2">{passed ? '🎉 Great work!' : 'Keep practicing!'}</h1>
                <p className="text-[13px] text-muted-foreground mb-4">
                  {passed
                    ? 'You passed the exam. Your result has been saved to your analytics.'
                    : 'Review your answers below and focus on the skills that need improvement.'}
                </p>
                {autoSubmitted && (
                  <span className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[12px] text-amber-600 dark:text-amber-400">
                    <Clock className="w-3.5 h-3.5" />Time ended — exam auto-submitted
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2.5 flex-shrink-0 w-full sm:w-auto">
                <Link to="/dashboard"
                  className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90 transition-spring">
                  View Dashboard
                </Link>
                <button
                  onClick={() => {
                    setExamStarted(false); setSubmitted(false); setAttemptId(null);
                    setExpiresAt(null); setTimeLeft(EXAM_DURATION_SECONDS); setAutoSubmitted(false);
                    autoSubmitLockRef.current = false;
                  }}
                  className="flex items-center justify-center gap-2 rounded-2xl glass-sm px-5 py-2.5 text-[13px] font-semibold text-foreground hover:shadow-md transition-spring">
                  Start new exam
                </button>
              </div>
            </div>
          </div>

          {/* Skill breakdown — staggered bar entrance */}
          {hasSkills && (
            <div className={`${glass} p-6 animate-stagger delay-1`} style={{ borderRadius:'1.5rem' }}>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55 font-semibold mb-4">Skill breakdown</p>
              <div className="space-y-3">
                {[
                  { label:'Grammar',     value:grammar, bar:'bg-emerald-500', text:'text-emerald-600 dark:text-emerald-400', delay:'delay-1' },
                  { label:'Vocabulary',  value:vocab,   bar:'bg-amber-500',   text:'text-amber-600 dark:text-amber-400',    delay:'delay-2' },
                  { label:'Punctuation', value:punct,   bar:'bg-blue-500',    text:'text-blue-600 dark:text-blue-400',      delay:'delay-3' },
                  { label:'Overall',     value:score,   bar:'bg-primary',     text:'text-primary',                          delay:'delay-4' },
                ].map(s => (
                  <div key={s.label} className={`animate-stagger ${s.delay}`}>
                    <ScoreBar label={s.label} value={s.value} bar={s.bar} text={s.text} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review answers */}
          <div className={`${glass} p-6`}>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55 font-semibold mb-4">Review your answers</p>
            <div className="space-y-3">
              {questions.map((q, idx) => {
                const qr = evaluation?.Question_Results?.[idx]
                  || evaluation?.Question_Results?.find?.(r => r.Question_Id === q.id)
                  || null;
                const open = expandedReview[q.id];
                const answered = (answers[q.id] || '').trim().length > 0;

                return (
                  <div key={q.id} className="rounded-2xl glass-sm overflow-hidden transition-spring hover:shadow-md">
                    <button
                      onClick={() => setExpandedReview(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                      className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/20 dark:hover:bg-white/5 transition-spring text-left gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-[12px] font-bold flex-shrink-0 glass-sm ${answered ? 'text-primary' : 'text-muted-foreground'}`}>
                          {idx + 1}
                        </div>
                        <span className="text-[13px] font-medium text-foreground truncate">
                          {q.question.slice(0, 65)}{q.question.length > 65 ? '…' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {qr?.Score != null && (
                          <span className="text-[11px] text-muted-foreground">{Math.round(Number(qr.Score))} pts</span>
                        )}
                        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {open && (
                      <div className="border-t border-white/20 dark:border-white/8 p-4 space-y-4 bg-white/10 dark:bg-white/[0.02]">
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground/55 uppercase tracking-wide mb-2">Question</p>
                          <p className="text-[13px] text-foreground leading-relaxed">{q.question}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground/55 uppercase tracking-wide mb-2">Your answer</p>
                          <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap glass-sm rounded-xl p-3">
                            {(answers[q.id] || '').trim() || <span className="text-muted-foreground italic">No answer given</span>}
                          </p>
                        </div>
                        {qr?.Corrected_Text && (
                          <div>
                            <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-2">Corrected version</p>
                            <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap glass-sm bg-emerald-500/5 rounded-xl p-3 border-emerald-500/20">
                              {qr.Corrected_Text}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-2xl glass-sm border-destructive/25 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
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
      <div data-page="exam" className="space-y-4">

        {/* ── Sticky floating header bar ─────────────────────────── */}
        <div className="sticky top-4 z-float glass-md rounded-2xl px-5 py-3 flex items-center gap-4"
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
              const wordTarget = parseWordTarget(question.question);
              const minWords   = getMinWords(question.question);
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
                        {meetsMin && wordCount > 0 && ' ✓'}
                      </span>
                      {wordTarget && (
                        <span className={`text-[11px] font-medium ${
                          inRange ? 'text-emerald-600 dark:text-emerald-400'
                          : wordCount < (wordTarget.min||0) ? 'text-amber-600 dark:text-amber-400'
                          : 'text-destructive'
                        }`}>
                          Target: {wordTarget.min}–{wordTarget.max}
                          {wordCount > 0 && (inRange ? ' ✓' : wordCount < wordTarget.min ? ' (too short)' : ' (too long)')}
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
