import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from './PageLayout';
import { useAuth, getUserId } from '../contexts/AuthContext';
import { useAnalytics } from '../contexts/AnalyticsContext';
import { usePlan } from '../contexts/PlanContext';
import { Camera, Trash2, Save, CheckCircle2, ChevronRight, Lock, LogOut, Edit2 } from 'lucide-react';
import { calcStreak } from '../utils/streak';

function toNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function formatJoin(c) { const d = new Date(c); return isNaN(d) ? null : d.toLocaleDateString(undefined, { month:'long', year:'numeric' }); }
function parseJsonField(val, fb = null) {
  if (!val) return fb;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fb; }
}

const CEFR = ['A1','A2','B1','B2','C1','C2'];

const LEVEL_PILL = {
  A1: 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300',
  A2: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  B1: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300',
  B2: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  C1: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  C2: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
};

const SKILLS = [
  { key:'grammar',     label:'Grammar',     bar:'bg-emerald-500', text:'text-emerald-600 dark:text-emerald-400' },
  { key:'vocabulary',  label:'Vocabulary',  bar:'bg-amber-500',   text:'text-amber-600 dark:text-amber-400'    },
  { key:'punctuation', label:'Punctuation', bar:'bg-blue-500',    text:'text-blue-600 dark:text-blue-400'      },
  { key:'overall',     label:'Overall',     bar:'bg-violet-500',  text:'text-violet-600 dark:text-violet-400'  },
];

const STAT_COLORS = [
  { label:'Average', valKey:'overall',  num:'text-violet-600 dark:text-violet-400', bg:'bg-violet-50/80 dark:bg-violet-900/15', border:'border-violet-100/80 dark:border-violet-800/20' },
  { label:'Grammar', valKey:'grammar',  num:'text-emerald-600 dark:text-emerald-400', bg:'bg-emerald-50/80 dark:bg-emerald-900/15', border:'border-emerald-100/80 dark:border-emerald-800/20' },
  { label:'Exams',   valKey:'exams',    num:'text-blue-600 dark:text-blue-400', bg:'bg-blue-50/80 dark:bg-blue-900/15', border:'border-blue-100/80 dark:border-blue-800/20' },
];

const glass = 'rounded-3xl glass-md';

function LevelPill({ level }) {
  const cls = LEVEL_PILL[level] || LEVEL_PILL.A1;
  return <span className={`inline-flex items-center h-7 px-3 rounded-full text-[12px] font-bold tracking-wider ${cls}`}>{level}</span>;
}

function SkillBar({ label, value, bar, text }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] text-muted-foreground/70 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-[5px] rounded-full bg-muted/50 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${bar}`} style={{ width:`${pct}%` }} />
      </div>
      <span className={`text-[12px] font-semibold w-8 text-right ${text}`}>{pct}%</span>
    </div>
  );
}

function DetailRow({ label, value, last = false }) {
  return (
    <div className={`flex items-center justify-between py-3.5 text-[14px] ${!last ? 'border-b border-border/25' : ''}`}>
      <span className="text-muted-foreground/70">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function ActionRow({ icon: Icon, label, onClick, danger = false, last = false }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3.5 py-4 text-[14px] transition-all duration-150 text-left active:scale-[0.99] ${!last ? 'border-b border-border/25' : ''} ${danger ? 'text-destructive hover:bg-destructive/5' : 'text-foreground hover:bg-muted/25'}`}>
      <span className={`w-8 h-8 rounded-2xl flex items-center justify-center flex-shrink-0 glass-sm ${danger ? 'bg-destructive/10' : ''}`}>
        <Icon className="w-[15px] h-[15px]" />
      </span>
      <span className="flex-1">{label}</span>
      {!danger && <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />}
    </button>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, updateProfile, logout } = useAuth();
  const { metrics, examAttempts = [], feedback = [] } = useAnalytics();
  const { planData, activeMode } = usePlan();

  const userId      = getUserId(user);
  const userLevel   = metrics?.latestLevel || user?.level || 'A1';
  const avgScore    = Math.round(toNumber(metrics?.avgOverall || 0));
  const avgGrammar  = Math.round(toNumber(metrics?.avgGrammar || 0));
  const avgVocab    = Math.round(toNumber(metrics?.avgVocab   || 0));
  const avgPunct    = Math.round(toNumber(metrics?.avgPunct   || 0));
  const totalEvals  = toNumber(metrics?.totalEvaluations || 0);
  const streak      = useMemo(() => calcStreak([
    ...examAttempts.map(a => a?.Submitted_At || a?.Created_At),
    ...feedback.map(f => f?.Created_At),
  ].filter(Boolean)), [examAttempts, feedback]);
  const joinDate    = formatJoin(user?.createdAt);
  const displayName = (user?.username || 'Student').trim();
  const initials    = displayName.slice(0, 2).toUpperCase();

  // CEFR ring
  const cefrIdx = CEFR.indexOf(userLevel);
  const ringPct = cefrIdx >= 0 ? Math.round((cefrIdx / 5) * 100) : 0;
  const R = 33, CIRC = 2 * Math.PI * R;

  // Compute plan progress from PlanContext — uses the user's active plan mode
  const planProgress = useMemo(() => {
    const parsed = parseJsonField(planData?.Plan, null);
    if (!parsed?.plan) return null;
    const allTs = [];
    for (const p of parsed.plan) for (const d of (p.days || [])) allTs.push(...(d.tasks || []));
    const done = allTs.filter(t => t.status === 'submitted' || t.status === 'reviewed').length;
    return allTs.length > 0 ? Math.round((done / allTs.length) * 100) : 0;
  }, [planData]);

  const completion = planProgress !== null
    ? planProgress
    : (() => { const p = user?.progress || { completed:0, total:0 }; return p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0; })();

  const skillValues = { grammar: avgGrammar, vocabulary: avgVocab, punctuation: avgPunct, overall: avgScore };
  const statValues  = { overall: `${avgScore}%`, grammar: `${avgGrammar}%`, exams: String(totalEvals || 0) };

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [formData, setFormData] = useState({ username: user?.username || '', email: user?.email || '' });
  const fileRef = useRef(null);

  const handleImageUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onloadend = () => updateProfile({ profileImage: r.result });
    r.readAsDataURL(f);
  };
  const handleSave = async () => {
    setIsSaving(true);
    try { await updateProfile(formData); setIsEditing(false); setShowSaved(true); setTimeout(() => setShowSaved(false), 2500); }
    finally { setIsSaving(false); }
  };
  const handleLogout = async () => { await logout(); navigate('/'); };

  return (
    <PageLayout maxWidth="max-w-xl">
      <div className="space-y-4">

        {/* ── Avatar hero ── */}
        <section className={glass + ' p-6 animate-spring-in'}>
          <div className="flex items-center gap-5">
            {/* avatar with CEFR ring */}
            <div className="relative flex-shrink-0 group" style={{ width:80, height:80 }}>
              <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0" style={{ transform:'rotate(-90deg)' }}>
                <circle cx="40" cy="40" r={R} fill="none" stroke="var(--border)" strokeWidth="3.5"/>
                <circle cx="40" cy="40" r={R} fill="none" stroke="var(--primary)" strokeWidth="3.5"
                  strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC*(1-ringPct/100)}
                  className="transition-all duration-1000"/>
              </svg>
              <div className="absolute rounded-full overflow-hidden bg-primary text-primary-foreground flex items-center justify-center text-[18px] font-bold" style={{ inset:6 }}>
                <span className="absolute inset-0 flex items-center justify-center text-[18px] font-bold text-primary-foreground">{initials}</span>
                {user?.profileImage && (
                  <img src={user.profileImage} alt={displayName} className="absolute inset-0 w-full h-full object-cover"
                    onError={e => { e.currentTarget.style.display = 'none'; }} />
                )}
              </div>
              <button
                onClick={() => user?.profileImage ? setShowRemove(true) : fileRef.current?.click()}
                className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-card border border-border/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                {user?.profileImage ? <Trash2 className="w-3 h-3 text-destructive"/> : <Camera className="w-3 h-3 text-primary"/>}
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden"/>
            </div>

            {/* name + progress bar */}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h1 className="text-[20px] font-bold text-foreground truncate leading-tight">{displayName}</h1>
                  <p className="text-[12px] text-muted-foreground/70 truncate mt-0.5">{user?.email || ''}</p>
                  {joinDate && <p className="text-[11px] text-muted-foreground/45 mt-0.5">Since {joinDate}</p>}
                </div>
                {!isEditing && (
                  <button onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1 text-[12px] text-primary/80 hover:text-primary flex-shrink-0 pt-0.5 transition-colors">
                    <Edit2 className="w-3 h-3"/> Edit
                  </button>
                )}
              </div>
              <div className="mt-3">
                <div className="h-[5px] w-full rounded-full bg-muted/50 overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width:`${ringPct}%` }}/>
                </div>
                <p className="text-[10px] text-muted-foreground/55 mt-1.5">{ringPct}% toward C2 · Level {userLevel}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Toasts ── */}
        {showRemove && (
          <div className={glass + ' p-4'}>
            <p className="text-[14px] mb-3 text-foreground">Remove your profile photo?</p>
            <div className="flex gap-2">
              <button onClick={() => { updateProfile({ profileImage: null }); setShowRemove(false); }}
                className="px-4 py-2 rounded-2xl bg-destructive text-white text-[13px] font-medium">Remove</button>
              <button onClick={() => setShowRemove(false)}
                className="px-4 py-2 rounded-2xl bg-muted text-foreground text-[13px]">Cancel</button>
            </div>
          </div>
        )}
        {showSaved && (
          <div className="flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 px-4 py-3 rounded-2xl text-[13px]">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0"/> Profile updated.
          </div>
        )}

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-3 gap-3">
          {STAT_COLORS.map(s => (
            <div key={s.label} className={`rounded-3xl glass-sm p-4 text-center ${s.bg}`}>
              <p className={`text-[22px] font-bold leading-none ${s.num}`}>{statValues[s.valKey.toLowerCase()]}</p>
              <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground/60 mt-2">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Skill scores ── */}
        <section className={glass + ' p-5'}>
          <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-muted-foreground/55 mb-4">Skill scores</p>
          <div className="space-y-3.5">
            {SKILLS.map(s => (
              <SkillBar key={s.key} label={s.label} value={skillValues[s.key]} bar={s.bar} text={s.text} />
            ))}
          </div>
        </section>

        {/* ── Details ── */}
        <section className={glass + ' px-5 py-1'}>
          <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-muted-foreground/55 pt-4 pb-2">Your details</p>
          <div className="flex items-center justify-between py-3.5 border-b border-border/25 text-[14px]">
            <span className="text-muted-foreground/70">Level</span>
            <LevelPill level={userLevel}/>
          </div>
          <DetailRow label="Streak"        value={streak > 0 ? `${streak} days` : '—'} />
          <DetailRow label="Evaluations"   value={totalEvals > 0 ? String(totalEvals) : '—'} />
          <DetailRow label="Plan progress" value={`${completion}%`} last />
        </section>

        {/* ── Edit form ── */}
        {isEditing && (
          <section className={glass + ' p-6'}>
            <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-muted-foreground/55 mb-5">Edit information</p>
            <div className="space-y-5">
              {[{ k:'username', l:'Username' }, { k:'email', l:'Email' }].map(({ k, l }) => (
                <div key={k}>
                  <label className="block text-[13px] font-semibold text-foreground mb-2">{l}</label>
                  <input
                    type={k === 'email' ? 'email' : 'text'}
                    value={formData[k]}
                    onChange={e => setFormData(p => ({ ...p, [k]: e.target.value }))}
                    className="w-full px-4 py-3.5 rounded-2xl text-[14px] text-foreground glass-sm placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-0 outline-none transition-spring"
                    placeholder={`Your ${k}`}
                  />
                </div>
              ))}
              <div className="flex gap-3 pt-1">
                <button onClick={handleSave} disabled={isSaving}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-2xl text-[13px] font-semibold disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition-spring">
                  <Save className="w-3.5 h-3.5"/>{isSaving ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  onClick={() => { setIsEditing(false); setFormData({ username: user?.username || '', email: user?.email || '' }); }}
                  className="px-6 py-3 rounded-2xl text-[13px] font-medium glass-sm text-foreground hover:shadow-md active:scale-[0.98] transition-spring">
                  Cancel
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Account ── */}
        <section className={glass + ' px-5 py-1'}>
          <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-muted-foreground/55 pt-4 pb-2">Account</p>
          <ActionRow icon={Lock}   label="Change password" onClick={() => navigate('/change-password')} />
          <ActionRow icon={LogOut} label="Sign out"        onClick={handleLogout} danger last />
        </section>

      </div>
    </PageLayout>
  );
}
