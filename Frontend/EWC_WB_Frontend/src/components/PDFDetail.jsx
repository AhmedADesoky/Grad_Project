import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageLayout } from './PageLayout';
import { useAuth, getUserId } from '../contexts/AuthContext';
import { getDocumentAnalysis } from '../graphql/AIService';
import {
  ArrowLeft, FileText, Loader2, AlertCircle, CheckCircle,
  XCircle, Clock, Copy, Check, ChevronDown, ChevronUp,
  BookOpen, Zap, Target, AlertTriangle, BarChart3, Shield,
} from 'lucide-react';
import { TextDiffPanel } from '../utils/diffUtils';

const glass = 'glass-md rounded-2xl border border-border/40';

function parseMaybeJson(v) {
  if (!v) return v;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}


function fmt(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ─── Overall score ring (large, primary color) ───────────────────────────────
function OverallRing({ value, size = 110 }) {
  const pct  = Math.min(100, Math.round(value || 0));
  const r    = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke="var(--primary)" strokeWidth="8" opacity="0.15" />
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke="var(--primary)" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
            transform={`rotate(-90 ${size/2} ${size/2})`}
            style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-primary">{pct}</span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-widest">score</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Overall</span>
    </div>
  );
}

// ─── Radar / Spider chart (Grammar · Vocab · Punct) ─────────────────────────
function RadarChart({ grammar, vocab, punct }) {
  // Fixed viewBox with generous padding so labels are never clipped
  const W = 280, H = 260;
  const cx = W / 2, cy = H / 2 + 8;
  const maxR = 88;

  const scores = [
    { label: 'Grammar',     value: Math.min(100, Math.round(grammar || 0)) },
    { label: 'Vocabulary',  value: Math.min(100, Math.round(vocab   || 0)) },
    { label: 'Punctuation', value: Math.min(100, Math.round(punct   || 0)) },
  ];
  const n = scores.length;
  const angle = (i) => (2 * Math.PI * i) / n - Math.PI / 2;
  const pt = (r, i) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  });

  const gridLevels = [0.25, 0.5, 0.75, 1];
  const gridPoly = (frac) => scores.map((_, i) => { const p = pt(maxR * frac, i); return `${p.x},${p.y}`; }).join(' ');
  const dataPoly = scores.map((s, i) => { const p = pt(maxR * (s.value / 100), i); return `${p.x},${p.y}`; }).join(' ');

  // Label anchors: top=center, bottom-right=start, bottom-left=end
  const labelAnchors = ['middle', 'start', 'end'];
  const labelOffsets = [{ dy: -14 }, { dx: 10, dy: 6 }, { dx: -10, dy: 6 }];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* Grid polygons */}
      {gridLevels.map((frac, gi) => (
        <polygon key={gi} points={gridPoly(frac)}
          fill="none" stroke="var(--border)" strokeWidth="1" opacity="0.4" />
      ))}
      {/* Axis lines */}
      {scores.map((_, i) => {
        const o = pt(maxR, i);
        return <line key={i} x1={cx} y1={cy} x2={o.x} y2={o.y}
          stroke="var(--border)" strokeWidth="1" opacity="0.4" />;
      })}
      {/* Grid % labels (50, 100) on right axis */}
      {[0.5, 1].map((frac) => {
        const p = pt(maxR * frac, 0);
        return <text key={frac} x={p.x + 5} y={p.y + 3}
          fontSize="8" fill="var(--muted-foreground)" opacity="0.55">{frac * 100}</text>;
      })}
      {/* Data fill */}
      <polygon points={dataPoly}
        fill="var(--primary)" fillOpacity="0.15"
        stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" />
      {/* Data dots */}
      {scores.map((s, i) => {
        const p = pt(maxR * (s.value / 100), i);
        return <circle key={i} cx={p.x} cy={p.y} r="4.5"
          fill="var(--primary)" stroke="var(--background)" strokeWidth="2" />;
      })}
      {/* Score values near dots */}
      {scores.map((s, i) => {
        const p = pt(maxR * (s.value / 100), i);
        const off = labelOffsets[i];
        return <text key={i}
          x={p.x + (off.dx || 0)} y={p.y + (off.dy || 0)}
          textAnchor={labelAnchors[i]} fontSize="9" fontWeight="700"
          fill="var(--primary)">{s.value}</text>;
      })}
      {/* Axis labels */}
      {scores.map((s, i) => {
        const p = pt(maxR + 26, i);
        const off = labelOffsets[i];
        return <text key={i}
          x={p.x + (off.dx || 0)} y={p.y + (off.dy || 0)}
          textAnchor={labelAnchors[i]} fontSize="10" fontWeight="600"
          fill="var(--foreground)" opacity="0.8">{s.label}</text>;
      })}
    </svg>
  );
}

// ─── Score stat row ───────────────────────────────────────────────────────────
function ScoreStat({ label, value }) {
  const pct = Math.round(value || 0);
  const grade =
    pct >= 90 ? { text: 'Excellent', color: 'text-emerald-400' } :
    pct >= 75 ? { text: 'Good',      color: 'text-primary'     } :
    pct >= 60 ? { text: 'Fair',      color: 'text-yellow-400'  } :
                { text: 'Low',       color: 'text-red-400'     };
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0 gap-2">
      <span className="text-sm text-foreground font-medium shrink-0">{label}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs font-semibold whitespace-nowrap ${grade.color}`}>{grade.text}</span>
        <span className="text-sm font-bold text-primary w-7 text-right">{pct}</span>
      </div>
    </div>
  );
}

// ─── CEFR Confidence Bar ─────────────────────────────────────────────────────
function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <span className="text-xs text-muted-foreground">Model confidence</span>
        <span className="text-xs font-bold text-primary">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all duration-1000"
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── CEFR levels scale ────────────────────────────────────────────────────────
const CEFR_LEVELS = ['A1','A2','B1','B2','C1','C2'];
function CEFRScale({ active }) {
  const idx = CEFR_LEVELS.indexOf(active);
  return (
    <div className="flex items-center gap-1">
      {CEFR_LEVELS.map((lvl, i) => (
        <div key={lvl} className="flex-1 flex flex-col items-center gap-1">
          <div className={`h-2 rounded-full w-full transition-all ${
            i === idx ? 'bg-primary'    :
            i <  idx  ? 'bg-primary/35' : 'bg-muted/50'
          }`}
            />
          <span className={`text-[9px] font-semibold ${i === idx ? 'text-primary' : 'text-muted-foreground/50'}`}>{lvl}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Issue chip ───────────────────────────────────────────────────────────────
const ISSUE_META = {
  tense:       { icon: <Clock className="w-3 h-3" />,         color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/25' },
  voice:       { icon: <Zap className="w-3 h-3" />,           color: 'text-blue-400   bg-blue-400/10   border-blue-400/25'   },
  grammar:     { icon: <BookOpen className="w-3 h-3" />,      color: 'text-primary    bg-primary/10    border-primary/25'    },
  vocabulary:  { icon: <Target className="w-3 h-3" />,        color: 'text-primary    bg-primary/10    border-primary/25'    },
  punctuation: { icon: <AlertTriangle className="w-3 h-3" />, color: 'text-primary/80 bg-primary/8     border-primary/20'    },
  spelling:    { icon: <Shield className="w-3 h-3" />,        color: 'text-red-400    bg-red-400/10    border-red-400/25'    },
};

function IssueChip({ label }) {
  const key  = (typeof label === 'string' ? label : label?.type || '').toLowerCase();
  const meta = Object.entries(ISSUE_META).find(([k]) => key.includes(k))?.[1]
            || { icon: <AlertCircle className="w-3 h-3" />, color: 'text-muted-foreground bg-muted/50 border-border/40' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium capitalize ${meta.color}`}>
      {meta.icon}{typeof label === 'string' ? label : label?.type || JSON.stringify(label)}
    </span>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy}
      className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function Section({ title, icon, children, defaultOpen = true, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={glass}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left group">
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-primary">{icon}</span>}
          <span className="font-semibold text-foreground text-sm">{title}</span>
          {badge != null && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold border border-primary/20">{badge}</span>
          )}
        </div>
        {open
          ? <ChevronUp   className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-border/30 pt-4">{children}</div>}
    </div>
  );
}

function LevelBadge({ level }) {
  return (
    <span className="px-3 py-1 rounded-full border text-sm font-bold tracking-wide flex-shrink-0 bg-primary/10 text-primary border-primary/30">
      {level}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function PDFDetail() {
  const { analysisId } = useParams();
  const { user }       = useAuth();
  const userId         = getUserId(user);

  const [rec,     setRec]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    if (!userId || !analysisId) return;
    setLoading(true); setError(null);
    try {
      const data = await getDocumentAnalysis({ Analysis_Id: analysisId, User_Id: userId });
      if (!data) throw new Error('Analysis not found');
      setRec(data);
    } catch (e) {
      setError(e.message || 'Failed to load analysis');
    } finally {
      setLoading(false);
    }
  }, [userId, analysisId]);

  useEffect(() => { load(); }, [load]);

  const issues = useMemo(() => {
    if (!rec?.Feedback?.Detected_Issues) return [];
    return parseMaybeJson(rec.Feedback.Detected_Issues) || [];
  }, [rec]);

  const errorList = useMemo(() => {
    if (!rec?.Feedback?.Errors) return [];
    return parseMaybeJson(rec.Feedback.Errors) || [];
  }, [rec]);

  const pageResults = useMemo(() => {
    if (!rec?.Page_Results) return [];
    return parseMaybeJson(rec.Page_Results) || [];
  }, [rec]);

  return (
    <PageLayout>
      <div className="space-y-5 max-w-3xl mx-auto" data-page="pdf">

        {/* Back */}
        <Link to="/pdf-history"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />Back to History
        </Link>

        {/* File header */}
        {rec && (
          <div className={`${glass} p-5 flex items-center gap-4`}
            style={{ borderLeft: '3px solid var(--primary)' }}>
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 border border-primary/20">
              <FileText className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-foreground truncate">{rec.File_Name || 'Untitled PDF'}</h1>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmt(rec.Created_At)}</span>
                <span>{rec.Page_Count} page{rec.Page_Count !== 1 ? 's' : ''}</span>
                <span className="capitalize">{(rec.Extraction_Tool || '').replace(/_/g, ' ')}</span>
                {rec.Status === 'COMPLETED'
                  ? <span className="flex items-center gap-1 text-emerald-400"><CheckCircle className="w-3 h-3" />Completed</span>
                  : <span className="flex items-center gap-1 text-red-400"><XCircle className="w-3 h-3" />Failed</span>
                }
              </div>
            </div>
            {rec.Classification?.Level && <LevelBadge level={rec.Classification.Level} />}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : rec ? (
          <>
            {/* ── Scores ── */}
            {rec.Feedback && (
              <Section title="Writing Scores" icon={<BarChart3 className="w-4 h-4" />}>
                <div className="flex flex-col items-center gap-4 max-w-xs mx-auto">
                  <OverallRing value={rec.Feedback.Overall_Score} />
                  <div className="w-full">
                    <ScoreStat label="Grammar"     value={rec.Feedback.Grammar_Score} />
                    <ScoreStat label="Vocabulary"  value={rec.Feedback.Vocab_Score}   />
                    <ScoreStat label="Punctuation" value={rec.Feedback.Punct_Score}   />
                  </div>
                </div>
              </Section>
            )}

            {/* ── CEFR Classification ── */}
            {rec.Classification?.Level && (
              <Section title="CEFR Classification" icon={<Target className="w-4 h-4" />}>
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Detected level</p>
                      <p className="text-3xl font-black text-primary tracking-wide">{rec.Classification.Level}</p>
                      {rec.Classification.Description && (
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{rec.Classification.Description}</p>
                      )}
                    </div>
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xl font-black text-primary">{rec.Classification.Level}</span>
                    </div>
                  </div>
                  <CEFRScale active={rec.Classification.Level} />
                  {rec.Classification.Confidence != null && (
                    <div className="pt-1">
                      <ConfidenceBar value={rec.Classification.Confidence} />
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* ── Detected Issues ── */}
            {issues.length > 0 && (
              <Section title="Detected Issues" icon={<AlertTriangle className="w-4 h-4" />} badge={issues.length}>
                <div className="flex flex-wrap gap-2">
                  {issues.map((issue, i) => <IssueChip key={i} label={issue} />)}
                </div>
                {rec.Feedback?.Dominant_Error && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Dominant issue: <span className="font-medium text-foreground capitalize">{rec.Feedback.Dominant_Error.replace(/_/g, ' ')}</span>
                    {rec.Feedback.Error_Trend && (
                      <> · Trend: <span className={`font-medium ${rec.Feedback.Error_Trend === 'improving' ? 'text-green-500' : rec.Feedback.Error_Trend === 'declining' ? 'text-red-500' : 'text-muted-foreground'}`}>{rec.Feedback.Error_Trend}</span></>
                    )}
                  </p>
                )}
              </Section>
            )}

            {/* ── Error Details ── */}
            {errorList.length > 0 && (
              <Section title="Error Details" icon={<XCircle className="w-4 h-4" />} badge={errorList.length} defaultOpen={false}>
                {(() => {
                  const PDF_ERR_STYLE = {
                    GRAM:  { badge: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',     bar: 'bg-red-500',    label: 'Grammar'     },
                    SPELL: { badge: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800', bar: 'bg-orange-500', label: 'Spelling'    },
                    PUNCT: { badge: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800', bar: 'bg-yellow-500', label: 'Punctuation' },
                    VOCAB: { badge: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',   bar: 'bg-blue-500',   label: 'Vocabulary'  },
                    WO:    { badge: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800', bar: 'bg-purple-500', label: 'Word Order'  },
                    STYLE: { badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', bar: 'bg-slate-400', label: 'Style' },
                  };
                  return (
                    <div className="rounded-xl overflow-hidden border border-border/40 bg-background/60">
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
                          const typeKey = Object.keys(PDF_ERR_STYLE).find(k => rawType.startsWith(k)) || null;
                          const style = typeKey ? PDF_ERR_STYLE[typeKey] : PDF_ERR_STYLE.STYLE;
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
                  );
                })()}
              </Section>
            )}

            {/* ── Text Comparison (Your Text vs Corrected) ── */}
            {rec.Feedback?.Corrected_Text && (
              <Section title="Text Comparison" icon={<CheckCircle className="w-4 h-4" />}>
                <TextDiffPanel
                  origText={rec.Clean_Text || ''}
                  corrText={rec.Feedback.Corrected_Text}
                  origLabel="Your Text"
                  corrLabel="Corrected Version"
                />
              </Section>
            )}

            {/* ── Extracted Text ── */}
            {rec.Clean_Text && (
              <Section title="Extracted Text" icon={<FileText className="w-4 h-4" />} defaultOpen={false}>
                <div className="relative rounded-xl bg-muted/30 border border-border/30 p-4">
                  <div className="absolute top-3 right-3">
                    <CopyButton text={rec.Clean_Text} />
                  </div>
                  <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto pr-8">
                    {rec.Clean_Text}
                  </pre>
                </div>
              </Section>
            )}

            {/* ── Pages ── */}
            {pageResults.length > 0 && (
              <Section title="Page Breakdown" icon={<BookOpen className="w-4 h-4" />} badge={pageResults.length} defaultOpen={false}>
                <div className="space-y-3">
                  {pageResults.map((pg, i) => (
                    <div key={i} className="rounded-xl border border-border/40 bg-muted/20 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-foreground">Page {pg.page_number ?? i + 1}</span>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{pg.word_count ?? 0} words</span>
                          {pg.confidence != null && <span>{Math.round(pg.confidence)}% conf.</span>}
                          {pg.tool && <span className="capitalize">{pg.tool.replace(/_/g, ' ')}</span>}
                        </div>
                      </div>
                      {pg.text && (
                        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{pg.text}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {rec.Error_Message && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive text-sm">
                <p className="font-semibold mb-1">Error</p>
                <p>{rec.Error_Message}</p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </PageLayout>
  );
}
