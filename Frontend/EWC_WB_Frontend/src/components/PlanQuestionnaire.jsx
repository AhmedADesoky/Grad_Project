import React, { useState } from 'react';
import {
  Calendar, CalendarDays, Zap, Target, Clock, BookOpen,
  ChevronRight, ChevronLeft, CheckCircle2, Sparkles,
  Flame, Leaf, BarChart2, PenLine, AlignLeft, Type,
  ScanText, Edit3, AlarmClock, Sun, Loader2,
} from 'lucide-react';
import { EWCLogo } from './EWCLogo';

const TOTAL_STEPS = 5;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FOCUS_OPTIONS = [
  { key: 'grammar',     label: 'Grammar',     Icon: AlignLeft,    ring: 'ring-emerald-500/50',  active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/40',  dot: 'bg-emerald-500' },
  { key: 'vocabulary',  label: 'Vocabulary',  Icon: Type,         ring: 'ring-blue-500/50',     active: 'bg-blue-500/10 text-blue-600 border-blue-500/40',           dot: 'bg-blue-500' },
  { key: 'writing',     label: 'Writing',     Icon: PenLine,      ring: 'ring-violet-500/50',   active: 'bg-violet-500/10 text-violet-600 border-violet-500/40',     dot: 'bg-violet-500' },
  { key: 'reading',     label: 'Reading',     Icon: BookOpen,     ring: 'ring-amber-500/50',    active: 'bg-amber-500/10 text-amber-600 border-amber-500/40',        dot: 'bg-amber-500' },
  { key: 'punctuation', label: 'Punctuation', Icon: Edit3,        ring: 'ring-rose-500/50',     active: 'bg-rose-500/10 text-rose-600 border-rose-500/40',          dot: 'bg-rose-500' },
  { key: 'spelling',    label: 'Spelling',    Icon: ScanText,     ring: 'ring-cyan-500/50',     active: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/40',          dot: 'bg-cyan-500' },
];

// ── Progress dots ─────────────────────────────────────────────────────────────
function ProgressBar({ step, totalSteps = TOTAL_STEPS }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-500 ${
          i < step ? 'bg-primary' : i === step - 1 ? 'bg-primary/50' : 'bg-muted/40'
        }`} />
      ))}
    </div>
  );
}

// ── Step label ────────────────────────────────────────────────────────────────
function StepLabel({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-bold text-primary/60 uppercase tracking-widest mb-3">
      <Icon className="w-3 h-3" />{label}
    </div>
  );
}

// ── Step 1: Plan Type ─────────────────────────────────────────────────────────
function StepPlanType({ value, onChange }) {
  const options = [
    {
      key: 'weekly',
      Icon: Calendar,
      title: 'Weekly Plan',
      duration: '7 days',
      tasks: '14–21 tasks',
      tagline: 'Quick sprint — great for busy schedules',
      bullets: ['One focused week', 'Easy to restart anytime', 'Clear weekly goals'],
      accentClass: 'text-primary',
      bgActive: 'border-primary bg-primary/6',
    },
    {
      key: 'monthly',
      Icon: CalendarDays,
      title: 'Monthly Plan',
      duration: '4 weeks',
      tasks: '56–84 tasks',
      tagline: 'Deep programme — builds lasting habits',
      bullets: ['4-week progression', 'Skills build week-to-week', 'Structured journey'],
      accentClass: 'text-violet-500',
      bgActive: 'border-violet-500/60 bg-violet-500/6',
    },
  ];

  return (
    <div>
      <StepLabel icon={Calendar} label="Step 1 of 5 — Plan Type" />
      <h2 className="text-2xl font-bold text-foreground mb-1">How long is your plan?</h2>
      <p className="text-sm text-muted-foreground mb-6">Choose the structure that fits your schedule best.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {options.map(opt => {
          const isSelected = value === opt.key;
          return (
            <button key={opt.key} onClick={() => onChange(opt.key)}
              className={`group text-left p-5 rounded-2xl border-2 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                isSelected ? opt.bgActive + ' shadow-sm' : 'border-border/40 bg-muted/10 hover:border-primary/30 hover:bg-muted/20'
              }`}>
              <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                  isSelected ? 'bg-primary/10' : 'bg-muted/40 group-hover:bg-muted/60'
                }`}>
                  <opt.Icon className={`w-5 h-5 ${isSelected ? opt.accentClass : 'text-muted-foreground'}`} />
                </div>
                {isSelected && <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />}
              </div>
              <p className="font-bold text-foreground text-base mb-1">{opt.title}</p>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">{opt.duration}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-semibold">{opt.tasks}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{opt.tagline}</p>
              <ul className="space-y-1.5">
                {opt.bullets.map((b, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSelected ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                    {b}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 2: Intensity ─────────────────────────────────────────────────────────
function StepIntensity({ value, onChange }) {
  const options = [
    {
      key: 'light',
      label: 'Light',
      tasks: '1 task / day',
      Icon: Leaf,
      desc: 'Just getting started or very busy — one task a day keeps skills growing.',
      iconClass: 'text-emerald-500',
      activeBg: 'border-emerald-500/50 bg-emerald-500/6',
      dotClass: 'bg-emerald-500',
    },
    {
      key: 'normal',
      label: 'Normal',
      tasks: '2 tasks / day',
      Icon: BarChart2,
      desc: 'Balanced pace — steady progress without feeling overwhelmed.',
      iconClass: 'text-primary',
      activeBg: 'border-primary bg-primary/6',
      dotClass: 'bg-primary',
    },
    {
      key: 'intensive',
      label: 'Intensive',
      tasks: '3 tasks / day',
      Icon: Flame,
      desc: 'Full commitment — rapid improvement through deep daily practice.',
      iconClass: 'text-orange-500',
      activeBg: 'border-orange-500/50 bg-orange-500/6',
      dotClass: 'bg-orange-500',
    },
  ];
  return (
    <div>
      <StepLabel icon={Zap} label="Step 2 of 5 — Study Intensity" />
      <h2 className="text-2xl font-bold text-foreground mb-1">How many tasks per day?</h2>
      <p className="text-sm text-muted-foreground mb-6">Choose how hard you want to push.</p>
      <div className="space-y-3">
        {options.map(opt => {
          const isSelected = value === opt.key;
          return (
            <button key={opt.key} onClick={() => onChange(opt.key)}
              className={`w-full text-left p-4 rounded-xl border-2 flex items-center gap-4 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                isSelected ? opt.activeBg + ' shadow-sm' : 'border-border/40 bg-muted/10 hover:border-primary/30 hover:bg-muted/20'
              }`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                isSelected ? 'bg-white/20' : 'bg-muted/40'
              }`}>
                <opt.Icon className={`w-4 h-4 ${isSelected ? opt.iconClass : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold text-foreground text-sm">{opt.label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    isSelected ? `bg-white/20 text-foreground` : 'bg-muted/60 text-muted-foreground'
                  }`}>{opt.tasks}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{opt.desc}</p>
              </div>
              {isSelected && <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 3: Focus Areas ───────────────────────────────────────────────────────
function StepFocus({ value, onChange, suggestedFocus = [] }) {
  const toggle = (key) => {
    onChange(value.includes(key) ? value.filter(k => k !== key) : [...value, key]);
  };
  return (
    <div>
      <StepLabel icon={Target} label="Step 3 of 5 — Focus Areas" />
      <h2 className="text-2xl font-bold text-foreground mb-1">What do you want to improve?</h2>
      {suggestedFocus.length > 0 ? (
        <p className="text-sm text-muted-foreground mb-6">
          Our AI detected issues in your writing — pre-selected below. Add or remove any you like.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground mb-6">Pick one or more — your plan will target these skills.</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {FOCUS_OPTIONS.map(opt => {
          const selected = value.includes(opt.key);
          return (
            <button key={opt.key} onClick={() => toggle(opt.key)}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 text-sm font-semibold transition-all duration-200 outline-none focus-visible:ring-2 ${opt.ring} ${
                selected ? opt.active : 'border-border/40 bg-muted/10 text-muted-foreground hover:border-primary/30 hover:bg-muted/20'
              }`}>
              {selected && (
                <span className="absolute top-2 right-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </span>
              )}
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${selected ? 'bg-current/10' : 'bg-muted/40'}`}>
                <opt.Icon className={`w-4 h-4 ${selected ? 'text-current' : 'text-muted-foreground'}`} />
              </div>
              <span className="text-xs font-bold">{opt.label}</span>
            </button>
          );
        })}
      </div>
      {value.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground/60 italic text-center">Select at least one focus area to continue.</p>
      )}
    </div>
  );
}

// ── Step 4: Schedule ──────────────────────────────────────────────────────────
function StepSchedule({ sessionMinutes, availableDays, onSession, onDays }) {
  const timeOptions = [
    { val: 20, label: '20 min', desc: 'Quick' },
    { val: 40, label: '40 min', desc: 'Balanced' },
    { val: 60, label: '60 min', desc: 'Deep' },
  ];
  const toggleDay = (day) => {
    onDays(availableDays.includes(day) ? availableDays.filter(d => d !== day) : [...availableDays, day]);
  };
  return (
    <div>
      <StepLabel icon={Clock} label="Step 4 of 5 — Schedule" />
      <h2 className="text-2xl font-bold text-foreground mb-1">When and how long?</h2>
      <p className="text-sm text-muted-foreground mb-6">Tasks will be sized to fit your session length.</p>

      <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
        <AlarmClock className="w-4 h-4 text-primary" />
        Session length per task
      </div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        {timeOptions.map(t => (
          <button key={t.val} onClick={() => onSession(t.val)}
            className={`py-4 rounded-xl border-2 text-sm font-bold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex flex-col items-center gap-0.5 ${
              sessionMinutes === t.val
                ? 'border-primary bg-primary/8 text-primary shadow-sm'
                : 'border-border/40 bg-muted/10 text-muted-foreground hover:border-primary/30 hover:bg-muted/20'
            }`}>
            {t.label}
            <span className="text-[10px] font-normal opacity-70">{t.desc}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
        <Sun className="w-4 h-4 text-primary" />
        Available study days
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {DAYS.map(day => (
          <button key={day} onClick={() => toggleDay(day)}
            className={`h-10 rounded-xl border-2 text-[11px] font-bold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
              availableDays.includes(day)
                ? 'border-primary bg-primary/10 text-primary shadow-sm'
                : 'border-border/40 bg-muted/10 text-muted-foreground hover:border-primary/30 hover:bg-muted/20'
            }`}>
            {day}
          </button>
        ))}
      </div>
      {availableDays.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground/60 italic text-center">Select at least one day to continue.</p>
      )}
    </div>
  );
}

// ── Step 5: Goal + Review ─────────────────────────────────────────────────────
function StepGoal({ goal, onChange, answers }) {
  const intensityMeta = {
    light:     { label: 'Light',     Icon: Leaf,     cls: 'text-emerald-600' },
    normal:    { label: 'Normal',    Icon: BarChart2, cls: 'text-primary' },
    intensive: { label: 'Intensive', Icon: Flame,    cls: 'text-orange-500' },
  };
  const focusLabels = answers.focus.map(k => FOCUS_OPTIONS.find(o => o.key === k)?.label || k);
  const im = intensityMeta[answers.intensity] || intensityMeta.normal;

  const rows = [
    { label: 'Plan type',     val: answers.mode === 'weekly' ? 'Weekly — 7 days' : 'Monthly — 4 weeks', Icon: Calendar },
    { label: 'Intensity',     val: im.label,                                                              Icon: im.Icon,   cls: im.cls },
    { label: 'Focus areas',   val: focusLabels.join(', ') || '—',                                        Icon: Target },
    { label: 'Session length',val: `${answers.sessionMinutes} min / task`,                               Icon: AlarmClock },
    { label: 'Study days',    val: answers.availableDays.join(', ') || 'All days',                       Icon: Sun },
  ];

  return (
    <div>
      <StepLabel icon={BookOpen} label="Step 5 of 5 — Your Goal" />
      <h2 className="text-2xl font-bold text-foreground mb-1">What's your goal? <span className="text-muted-foreground font-medium text-lg">(optional)</span></h2>
      <p className="text-sm text-muted-foreground mb-4">Tell us what you want to achieve — this personalises every task prompt.</p>

      <textarea
        value={goal}
        onChange={e => onChange(e.target.value)}
        rows={3}
        placeholder="e.g. My goal is to write clear, professional emails at work, strengthen my grammar, and build the confidence to express my ideas accurately in written English…"
        className="w-full px-4 py-3 rounded-xl border border-border bg-input-background text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 mb-5 transition-shadow"
      />

      <div className="rounded-2xl border border-border/40 bg-muted/10 p-4">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-primary" />Your Plan Summary
        </p>
        <div className="space-y-2.5">
          {rows.map(({ label, val, Icon, cls }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${cls || 'text-muted-foreground'}`} />
                {label}
              </div>
              <span className="text-xs font-semibold text-foreground text-right max-w-[55%] leading-relaxed">{val}</span>
            </div>
          ))}
        </div>
        {goal && (
          <div className="border-t border-border/30 pt-3 mt-3 text-xs text-muted-foreground/70 italic line-clamp-2">"{goal}"</div>
        )}
      </div>
    </div>
  );
}

// ── Main Questionnaire ────────────────────────────────────────────────────────
// renewalMode: if set, skip the plan-type step (step 1) and goal step (step 5).
// savedGoal:   pre-filled goal carried over from the existing plan.
export function PlanQuestionnaire({ onComplete, generating = false, suggestedFocus = [], renewalMode = null, savedGoal = '' }) {
  const isRenewal = !!renewalMode;

  // In renewal mode we have 3 steps: intensity → focus → schedule
  // In first-time mode we have 5 steps: plan type → intensity → focus → schedule → goal
  const STEPS = isRenewal ? 3 : TOTAL_STEPS;

  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState({
    mode: renewalMode || null,
    intensity: 'normal',
    focus: Array.isArray(suggestedFocus) && suggestedFocus.length > 0 ? suggestedFocus : [],
    sessionMinutes: 40,
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    goal: savedGoal || '',
  });

  const set = (key) => (val) => setAnswers(prev => ({ ...prev, [key]: val }));

  // Map logical step to actual step component
  // First-time:  1=PlanType  2=Intensity  3=Focus  4=Schedule  5=Goal
  // Renewal:     1=Intensity  2=Focus  3=Schedule
  const componentStep = isRenewal ? step + 1 : step;

  const canNext = () => {
    if (!isRenewal && step === 1) return !!answers.mode;      // plan type
    if (componentStep === 3)      return answers.focus.length > 0; // focus
    if (componentStep === 4)      return answers.availableDays.length > 0; // schedule
    return true;
  };

  const next   = () => { if (canNext() && step < STEPS) setStep(s => s + 1); };
  const back   = () => { if (step > 1) setStep(s => s - 1); };
  const submit = () => { if (canNext()) onComplete({ ...answers, mode: renewalMode || answers.mode, goal: savedGoal || answers.goal }); };

  if (generating) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Building Your Plan</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs leading-relaxed">
              Analysing your answers and creating a personalised learning path. This may take 10–30 seconds.
            </p>
          </div>
          <div className="flex gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-primary/50 animate-pulse"
                style={{ animationDelay: `${i * 0.25}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <EWCLogo variant="agent" size={48} />
          </div>
          {isRenewal ? (
            <>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">Switch to {renewalMode.charAt(0).toUpperCase() + renewalMode.slice(1)} Plan</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                Adjust your preferences for the new plan format.
              </p>
              {savedGoal && (
                <div className="mt-3 mx-auto max-w-sm rounded-xl border border-border/40 bg-muted/20 px-4 py-2.5 text-left">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Your goal (carried over)</p>
                  <p className="text-xs text-foreground/70 italic line-clamp-2">"{savedGoal}"</p>
                </div>
              )}
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">Build Your Plan</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                Answer a few questions — we'll generate a personalised learning plan.
              </p>
            </>
          )}
        </div>

        {/* Card */}
        <div className="glass-md rounded-2xl border border-border/50 p-7 shadow-lg shadow-black/5">
          <ProgressBar step={step} totalSteps={STEPS} />

          {componentStep === 1 && <StepPlanType value={answers.mode} onChange={set('mode')} />}
          {componentStep === 2 && <StepIntensity value={answers.intensity} onChange={set('intensity')} />}
          {componentStep === 3 && <StepFocus value={answers.focus} onChange={set('focus')} suggestedFocus={suggestedFocus} />}
          {componentStep === 4 && (
            <StepSchedule
              sessionMinutes={answers.sessionMinutes}
              availableDays={answers.availableDays}
              onSession={set('sessionMinutes')}
              onDays={set('availableDays')}
            />
          )}
          {componentStep === 5 && <StepGoal goal={answers.goal} onChange={set('goal')} answers={answers} />}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-5 border-t border-border/30">
            <button onClick={back} disabled={step === 1}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border/40 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-muted/20 transition-all disabled:opacity-30 disabled:pointer-events-none">
              <ChevronLeft className="w-4 h-4" />Back
            </button>

            <div className="flex items-center gap-1.5">
              {Array.from({ length: STEPS }).map((_, i) => (
                <div key={i} className={`rounded-full transition-all duration-300 ${
                  i + 1 === step ? 'w-5 h-1.5 bg-primary' : i + 1 < step ? 'w-1.5 h-1.5 bg-primary/50' : 'w-1.5 h-1.5 bg-muted/50'
                }`} />
              ))}
            </div>

            {step < STEPS ? (
              <button onClick={next} disabled={!canNext()}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:pointer-events-none shadow-sm">
                Continue<ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={submit} disabled={generating || !canNext()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 shadow-sm">
                {generating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Generating…
                  </>
                ) : (
                  <><Sparkles className="w-4 h-4" />Generate My Plan</>
                )}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground/40 mt-4">
          You can change your plan type or settings anytime.
        </p>
      </div>
    </div>
  );
}
