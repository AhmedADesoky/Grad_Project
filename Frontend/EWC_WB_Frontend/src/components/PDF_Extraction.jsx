import React, { useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PageLayout } from './PageLayout';
import { useAuth, getUserId } from '../contexts/AuthContext';
import { analyzePdfDocument } from '../graphql/AIService';
import { checkAndIncrement, checkLimit } from '../graphql/UserServer';
import { useToast } from '../contexts/ToastContext';
import {
  CloudUpload, Sparkles, FileText, AlertCircle, X,
  ChevronLeft, ChevronRight, Copy, Check, ArrowRight,
  BookOpen, Target, Zap, BarChart3, History,
} from 'lucide-react';
import { wordDiff, DiffText } from '../utils/diffUtils';

// ── helpers ───────────────────────────────────────────────────────────────────
function parseMaybeJson(v) {
  if (!v) return v;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}
async function readBase64(file) {
  // Use arrayBuffer + manual encoding to avoid blocking the main thread with
  // FileReader.readAsDataURL, which synchronously builds a data-URL string for
  // files up to 40 MB and can freeze the UI for 1-3 seconds.
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  // Process in 8 kB chunks so the JS engine can yield between chunks
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:application/pdf;base64,${btoa(binary)}`;
}
async function hashFile(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function parseScores(feedback) {
  if (!feedback) return null;
  const raw = feedback.Scores;
  const s = raw && typeof raw === 'object' ? raw
    : raw ? (() => { try { return JSON.parse(raw); } catch { return {}; } })()
    : {};
  const n = v => Math.round(Number(v || 0));
  const grammar = n(s.grammar_score ?? s.Grammar_Score ?? s.grammar ?? feedback.Grammar_Score ?? 0);
  const vocab   = n(s.vocab_score   ?? s.Vocab_Score   ?? s.vocab   ?? feedback.Vocab_Score   ?? 0);
  const punct   = n(s.punct_score   ?? s.Punct_Score   ?? s.punct   ?? feedback.Punct_Score   ?? 0);
  const overall = n(s.overall_score ?? s.Overall_Score ?? s.overall ?? feedback.Overall_Score ?? 0);
  return (grammar + vocab + punct + overall) > 0 ? { grammar, vocab, punct, overall } : null;
}
// ── sub-components ────────────────────────────────────────────────────────────

// ── Overall score gauge (half-circle arc) ────────────────────────────────────
function ScoreGauge({ overall = 0 }) {
  const pct   = Math.min(100, Math.round(overall));
  const W     = 180, H = 110;
  const cx    = W / 2, cy = H - 10;
  const r     = 78;
  // Half-circle: from 180° to 0° (left to right)
  const startAngle = Math.PI;
  const endAngle   = 0;
  const totalArc   = Math.PI; // 180°
  const fillAngle  = startAngle - (pct / 100) * totalArc;

  const polarX = (a) => cx + r * Math.cos(a);
  const polarY = (a) => cy + r * Math.sin(a);

  // Background arc path (full half-circle)
  const bgPath = `M ${polarX(startAngle)} ${polarY(startAngle)}
    A ${r} ${r} 0 0 1 ${polarX(endAngle)} ${polarY(endAngle)}`;
  // Data arc path (filled portion)
  const largeArc = pct > 50 ? 1 : 0;
  const dataPath = pct === 0 ? '' :
    `M ${polarX(startAngle)} ${polarY(startAngle)}
     A ${r} ${r} 0 ${largeArc} 1 ${polarX(fillAngle)} ${polarY(fillAngle)}`;

  const grade =
    pct >= 90 ? 'Excellent' :
    pct >= 75 ? 'Good'      :
    pct >= 60 ? 'Fair'      : 'Needs Work';

  // Tick marks at 0, 25, 50, 75, 100
  const ticks = [0, 25, 50, 75, 100].map(v => {
    const a = startAngle - (v / 100) * totalArc;
    return { v, x1: polarX(a) * 1, y1: polarY(a), a };
  });

  return (
    <div className="flex flex-col items-center">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Background track */}
        <path d={bgPath} fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round" opacity="0.35" />
        {/* Score arc */}
        {pct > 0 && (
          <path d={dataPath} fill="none" stroke="var(--primary)" strokeWidth="10" strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease' }} />
        )}
        {/* Tick marks */}
        {ticks.map(({ v, a }) => {
          const inner = r - 14, outer = r + 2;
          return (
            <line key={v}
              x1={cx + inner * Math.cos(a)} y1={cy + inner * Math.sin(a)}
              x2={cx + outer * Math.cos(a)} y2={cy + outer * Math.sin(a)}
              stroke="var(--border)" strokeWidth="1.5" opacity="0.5" />
          );
        })}
        {/* Tick labels */}
        {ticks.filter(t => t.v % 50 === 0).map(({ v, a }) => {
          const lr = r + 14;
          return (
            <text key={v} x={cx + lr * Math.cos(a)} y={cy + lr * Math.sin(a)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="8" fill="var(--muted-foreground)" opacity="0.6">{v}</text>
          );
        })}
        {/* Center score */}
        <text x={cx} y={cy - 22} textAnchor="middle" fontSize="28" fontWeight="800" fill="var(--primary)">{pct}</text>
        <text x={cx} y={cy - 6}  textAnchor="middle" fontSize="9"  fontWeight="500" fill="var(--muted-foreground)" opacity="0.7">OVERALL</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--primary)" opacity="0.85">{grade}</text>
      </svg>
    </div>
  );
}

// ── Skill column chart (vertical bars with 70% pass line) ────────────────────
function SkillColumnChart({ grammar = 0, vocab = 0, punct = 0 }) {
  const PASS  = 70;
  const W     = 220, H = 130;
  const padL  = 28, padR = 10, padT = 14, padB = 22;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const skills = [
    { label: 'Grammar',  value: Math.round(grammar), color: 'var(--primary)' },
    { label: 'Vocab',    value: Math.round(vocab),   color: 'var(--primary)' },
    { label: 'Punct',    value: Math.round(punct),   color: 'var(--primary)' },
  ];

  const colW   = chartW / skills.length;
  const barW   = colW * 0.45;
  const yScale = (v) => chartH - (v / 100) * chartH;
  const passY  = padT + yScale(PASS);

  // Y-axis labels
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Y-axis grid lines */}
      {yTicks.map(v => {
        const y = padT + yScale(v);
        return (
          <g key={v}>
            <line x1={padL} y1={y} x2={W - padR} y2={y}
              stroke="var(--border)" strokeWidth="0.5" opacity="0.4" strokeDasharray={v === 0 ? '' : '3,3'} />
            <text x={padL - 4} y={y} textAnchor="end" dominantBaseline="middle"
              fontSize="7" fill="var(--muted-foreground)" opacity="0.55">{v}</text>
          </g>
        );
      })}

      {/* Pass line at 70% */}
      <line x1={padL} y1={passY} x2={W - padR} y2={passY}
        stroke="#FBBF24" strokeWidth="1.2" strokeDasharray="4,3" opacity="0.75" />
      <text x={W - padR + 2} y={passY} dominantBaseline="middle"
        fontSize="7" fill="#FBBF24" opacity="0.8">70%</text>

      {/* Columns */}
      {skills.map((s, i) => {
        const cx  = padL + i * colW + colW / 2;
        const bh  = (s.value / 100) * chartH;
        const by  = padT + chartH - bh;
        const pass = s.value >= PASS;
        const col  = pass ? 'var(--primary)' : '#F87171';

        return (
          <g key={s.label}>
            {/* Bar background */}
            <rect x={cx - barW / 2} y={padT} width={barW} height={chartH}
              fill="var(--border)" opacity="0.12" rx="3" />
            {/* Bar fill */}
            <rect x={cx - barW / 2} y={by} width={barW} height={bh}
              fill={col} opacity="0.85" rx="3"
              style={{ transition: 'height 0.8s ease, y 0.8s ease' }} />
            {/* Score on top */}
            <text x={cx} y={by - 4} textAnchor="middle"
              fontSize="9" fontWeight="700" fill={col}>{s.value}</text>
            {/* Label below */}
            <text x={cx} y={H - padB + 10} textAnchor="middle"
              fontSize="8.5" fontWeight="600" fill="var(--foreground)" opacity="0.75">{s.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

const LEVEL_COLOR = { A1:'text-slate-400', A2:'text-blue-400', B1:'text-emerald-400', B2:'text-amber-400', C1:'text-orange-400', C2:'text-red-400' };
const ISSUE_STYLE = {
  grammar:     'bg-red-500/10 text-red-400 border-red-500/20',
  punctuation: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  vocabulary:  'bg-blue-500/10 text-blue-400 border-blue-500/20',
  spelling:    'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

// ── main component ────────────────────────────────────────────────────────────
export function PDF_Extraction() {
  const { user } = useAuth();
  const userId = useMemo(() => getUserId(user), [user]);
  const toast = useToast();

  const [dragging,     setDragging]     = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [saveToDb,     setSaveToDb]     = useState(true);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [result,       setResult]       = useState(null);
  const [currentPage,  setCurrentPage]  = useState(0);
  const [copied,       setCopied]       = useState(false);
  // Deduplication: cache { hash → result } so the same file is never re-analyzed
  const hashCacheRef = useMemo(() => new Map(), []);

  const onFile = file => {
    if (!file || file.type !== 'application/pdf') { setError('Please select a valid PDF file.'); return; }
    if (file.size > 40 * 1024 * 1024) { setError('PDF is too large (max 40 MB). Please use a smaller file.'); return; }
    setSelectedFile(file); setError(''); setResult(null); setCurrentPage(0);
  };
  const onDrop = useCallback(e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }, []);
  const clearFile = e => { e.stopPropagation(); setSelectedFile(null); setResult(null); setError(''); };

  const submit = async e => {
    e.preventDefault(); setError(''); setResult(null); setCurrentPage(0);
    if (!selectedFile) { setError('Please upload a PDF file.'); return; }
    if (!userId)       { setError('Not authenticated. Please sign in.'); return; }
    try {
      setLoading(true);

      // ── Deduplication: hash the file and return cached result if already analyzed ──
      const hash = await hashFile(selectedFile);
      const cacheKey = `${userId}:${hash}`;
      if (hashCacheRef.has(cacheKey)) {
        setResult(hashCacheRef.get(cacheKey));
        setLoading(false);
        return;
      }

      // Read-only check — does not increment yet
      const limitCheck = await checkLimit({ User_Id: userId, Counter: 'pdfs' }).catch(() => null);
      if (limitCheck && !limitCheck.allowed) {
        toast.error(`PDF limit reached (${limitCheck.used}/${limitCheck.limit}). Upgrade your plan to analyze more PDFs.`);
        setLoading(false);
        return;
      }
      const b64 = await readBase64(selectedFile);
      const r = await analyzePdfDocument({
        Pdf_Base64: b64, Pdf_Path: null, Pdf_Url: null,
        File_Name: selectedFile.name,
        User_Id: userId,
        Save_To_Database: saveToDb,
        Use_OCR: true,
      });
      if (!r?.Success) throw new Error(r?.Error || 'Analysis failed');
      // Analysis succeeded — count the trial now
      await checkAndIncrement({ User_Id: userId, Counter: 'pdfs' }).catch(() => {});
      hashCacheRef.set(cacheKey, r.Result);
      setResult(r.Result);
    } catch (err) {
      const msg = err.message || 'Unexpected error';
      setError(msg);
      toast.error(msg);
    } finally { setLoading(false); }
  };

  const pageResults    = Array.isArray(parseMaybeJson(result?.Page_Results)) ? parseMaybeJson(result?.Page_Results) : [];
  const detectedIssues = parseMaybeJson(result?.Feedback?.Detected_Issues) || [];
  const corrText       = result?.Feedback?.Corrected_Text || '';
  // The correction covers the WHOLE document, so compare it against the whole
  // original (all pages), not a single page — otherwise page 2 appears in the
  // corrected panel but is missing from "Your Text".
  const fullOrig       = (result?.Clean_Text
                          || pageResults.map(p => p?.text || '').filter(Boolean).join('\n\n'));
  const origText       = corrText ? fullOrig : '';
  const { oa, ca }     = corrText && origText ? wordDiff(origText, corrText) : { oa:[], ca:[] };
  const scores         = parseScores(result?.Feedback);
  const level          = result?.Classification?.Level || '';
  const confidence     = result?.Classification?.Confidence
    ? `${(Number(result.Classification.Confidence) * 100).toFixed(0)}%`
    : null;

  const weakestSkill = scores
    ? Object.entries({ Grammar:scores.grammar, Vocabulary:scores.vocab, Punctuation:scores.punct })
        .sort((a,b) => a[1]-b[1])[0]?.[0]
    : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(corrText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (HTTP or restricted browser) — fall back to execCommand
      try {
        const ta = document.createElement('textarea');
        ta.value = corrText;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error('Copy failed — please select and copy the text manually.');
      }
    }
  };

  return (
    <PageLayout>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Page header ── */}
        <div className="rounded-3xl glass-md p-6 animate-spring-in">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55 font-semibold mb-1">Document Intelligence</p>
              <h1 className="text-2xl font-bold text-foreground">PDF Analysis</h1>
              <p className="text-[13px] text-muted-foreground mt-1 max-w-xl">
                Upload a PDF — text is extracted automatically using our AI model, then analysed for CEFR level and writing feedback.
              </p>
            </div>
            <Link to="/pdf-history"
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity">
              <History className="w-4 h-4" />
              View History
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">

          {/* ── Left: upload form ── */}
          <form onSubmit={submit} className="space-y-4">

            {/* Drop zone */}
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onClick={() => document.getElementById('pdf-input').click()}
              className={`rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 p-8 text-center select-none ${
                dragging
                  ? 'border-primary bg-primary/8 scale-[1.01]'
                  : selectedFile
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-border/40 hover:border-primary/40 hover:bg-primary/4 bg-muted/10'
              }`}
            >
              {selectedFile ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="flex items-center gap-2 max-w-full">
                    <span className="text-[13px] font-medium text-foreground truncate max-w-[200px]">{selectedFile.name}</span>
                    <button type="button" onClick={clearFile}
                      className="flex-shrink-0 w-5 h-5 rounded-full bg-muted/60 hover:bg-destructive/20 flex items-center justify-center transition-colors">
                      <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                  <span className="text-[11px] text-muted-foreground/60">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${dragging ? 'bg-primary/20' : 'bg-muted/40'}`}>
                    <CloudUpload className={`w-6 h-6 transition-colors ${dragging ? 'text-primary' : 'text-muted-foreground/50'}`} />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground mb-0.5">Drop your PDF here</p>
                    <p className="text-[11px] text-muted-foreground/60">or click to browse · PDF only · up to 40 MB</p>
                  </div>
                </div>
              )}
            </div>
            <input id="pdf-input" type="file" accept="application/pdf" onChange={e => onFile(e.target.files?.[0])} className="hidden" />

            {/* Save history toggle */}
            <div className="rounded-xl border border-border/40 bg-muted/10 px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-foreground leading-tight">Save to history</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Store results for future reference</p>
              </div>
              <div
                onClick={() => setSaveToDb(v => !v)}
                className={`w-8 rounded-full flex items-center transition-colors px-0.5 cursor-pointer flex-shrink-0 ${saveToDb ? 'bg-primary' : 'bg-muted'}`}
                style={{ height: 18 }}
              >
                <div className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${saveToDb ? 'translate-x-3.5' : 'translate-x-0'}`} />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-[13px] text-destructive animate-spring-in">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading || !selectedFile}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 font-semibold text-[14px] text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
              {loading
                ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Analysing…</>
                : <><Sparkles className="w-4 h-4" /> Analyse Document</>}
            </button>

          </form>

          {/* ── Right: results ── */}
          <div className="space-y-4 min-w-0">

            {/* Empty state */}
            {!result && !loading && (
              <div className="rounded-2xl border border-dashed border-border/40 p-14 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-7 h-7 text-muted-foreground/30" />
                </div>
                <p className="text-[14px] font-medium text-foreground/50 mb-1">No document yet</p>
                <p className="text-[12px] text-muted-foreground/40">Upload a PDF to see analysis results here</p>
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div className="rounded-2xl glass-sm p-6 animate-pulse space-y-4">
                <div className="h-4 bg-muted/40 rounded-full w-1/3" />
                <div className="h-3 bg-muted/30 rounded-full w-2/3" />
                <div className="h-3 bg-muted/30 rounded-full w-1/2" />
                <div className="h-3 bg-muted/30 rounded-full w-3/4" />
                <p className="text-center text-[12px] text-muted-foreground pt-2">Extracting text and running analysis…</p>
              </div>
            )}

            {result && (
              <>
                {/* ── Stats row ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {
                      icon: BookOpen, label: 'Pages',
                      value: result?.Page_Count ?? '—',
                      sub: result?.Extraction_Tool || '',
                      cls: 'text-foreground',
                    },
                    {
                      icon: Target, label: 'CEFR Level',
                      value: level || '—',
                      sub: confidence ? `${confidence} confidence` : '',
                      cls: LEVEL_COLOR[level] || 'text-foreground',
                    },
                    {
                      icon: Zap, label: 'Overall',
                      value: scores ? `${scores.overall}%` : '—',
                      sub: 'writing score',
                      cls: 'text-primary',
                    },
                    {
                      icon: BarChart3, label: 'Issues',
                      value: detectedIssues.length || '0',
                      sub: 'detected',
                      cls: detectedIssues.length ? 'text-amber-400' : 'text-emerald-400',
                    },
                  ].map(({ icon: Icon, label, value, sub, cls }) => (
                    <div key={label} className="rounded-xl glass-sm p-4 flex flex-col gap-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground/50" />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/55 font-semibold">{label}</span>
                      </div>
                      <p className={`text-[22px] font-bold leading-none ${cls}`}>{value}</p>
                      {sub && <p className="text-[10px] text-muted-foreground/50 truncate">{sub}</p>}
                    </div>
                  ))}
                </div>

                {/* ── Skill scores ── */}
                {scores && (
                  <div className="rounded-2xl glass-sm p-5 animate-spring-in">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/55 font-semibold mb-4">Score Analysis</p>
                    <div className="flex flex-col sm:flex-row items-center justify-around gap-4">

                      {/* Left: overall gauge */}
                      <div className="flex flex-col items-center gap-1">
                        <ScoreGauge overall={scores.overall} />
                        <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Score Gauge</p>
                      </div>

                      <div className="hidden sm:block w-px self-stretch bg-border/30" />

                      {/* Right: skill column chart with pass line */}
                      <div className="flex flex-col items-center gap-1">
                        <SkillColumnChart grammar={scores.grammar} vocab={scores.vocab} punct={scores.punct} />
                        <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Skill Pass / Fail  (70% threshold)</p>
                      </div>

                    </div>

                    {/* Model-based writing quality (DeBERTa score_head) */}
                    {(result?.Feedback?.Severity != null || result?.Feedback?.Fluency != null) && (
                      <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-2 gap-3">
                        {(() => {
                          const sev = Number(result?.Feedback?.Severity || 0);
                          const flu = Number(result?.Feedback?.Fluency || 0);
                          const cleanliness = Math.round((1 - sev) * 100); // 0 sev = 100% clean
                          const fluency = Math.round(flu * 100);
                          const Bar = ({ label, value, hint, tone }) => (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">{label}</span>
                                <span className={`text-[11px] font-bold ${tone}`}>{value}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                                <div className={`h-full rounded-full ${value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${value}%` }} />
                              </div>
                              <p className="text-[9px] text-muted-foreground/45 mt-1">{hint}</p>
                            </div>
                          );
                          return (
                            <>
                              <Bar label="Cleanliness" value={cleanliness} tone="text-emerald-400" hint="Model error-severity (higher = fewer/lighter errors)" />
                              <Bar label="Fluency" value={fluency} tone="text-primary" hint="Model fluency score" />
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}


                {/* ── Detected issues ── */}
                {detectedIssues.length > 0 && (
                  <div className="rounded-2xl glass-sm p-4 animate-spring-in">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/55 font-semibold mb-3">Detected Issues</p>
                    <div className="flex flex-wrap gap-2">
                      {detectedIssues.map((issue, i) => (
                        <span key={i} className={`text-[11px] font-medium px-3 py-1.5 rounded-lg border ${ISSUE_STYLE[(issue || '').toLowerCase()] || 'bg-muted/40 text-muted-foreground border-border/40'}`}>
                          {issue}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Text comparison ── */}
                {(oa.length > 0 || corrText) && (
                  <div className="rounded-2xl glass-sm overflow-hidden animate-spring-in">
                    {/* header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
                      <span className="text-[12px] font-semibold text-foreground flex-1">
                        Text Comparison
                        {pageResults.length > 1 && (
                          <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                            (full document · {pageResults.length} pages)
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500/30" />Errors</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/30" />Fixed</span>
                      </div>
                      {corrText && (
                        <button onClick={handleCopy}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground">
                          {copied
                            ? <><Check className="w-3.5 h-3.5 text-emerald-400" /><span className="text-[10px] text-emerald-400">Copied</span></>
                            : <><Copy className="w-3.5 h-3.5" /><span className="text-[10px]">Copy</span></>}
                        </button>
                      )}
                    </div>
                    {/* panels */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/30">
                      <div className="p-4 bg-red-500/5">
                        <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2.5">Your Text</p>
                        <div className="whitespace-pre-wrap">
                          {oa.length
                            ? <DiffText tokens={oa} mode="orig" />
                            : <span className="text-muted-foreground/50 text-[13px] italic">No original text extracted</span>}
                        </div>
                      </div>
                      <div className="p-4 bg-emerald-500/5">
                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2.5">Corrected</p>
                        <div className="whitespace-pre-wrap">
                          {ca.length
                            ? <DiffText tokens={ca} mode="corr" />
                            : corrText
                              ? <span className="text-[13px] text-foreground">{corrText}</span>
                              : <span className="text-muted-foreground/50 text-[13px] italic">No correction</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Error Breakdown (per-error with explanation) ── */}
                {(() => {
                  const errorList = parseMaybeJson(result?.Feedback?.Errors) || [];
                  if (!Array.isArray(errorList) || errorList.length === 0) return null;
                  const errTypeStyle = {
                    GRAM:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                    SPELL: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                    PUNCT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                    VOCAB: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                    WO:    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
                    STYLE: 'bg-muted text-muted-foreground',
                  };
                  return (
                    <div className="rounded-2xl glass-sm p-4 animate-spring-in space-y-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/55 font-semibold">Error Breakdown</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          {errorList.length}
                        </span>
                        {result?.Feedback?.Dominant_Error && (
                          <span className="ml-auto text-[10px] text-muted-foreground/60">
                            Dominant: <span className="font-medium text-foreground capitalize">{String(result.Feedback.Dominant_Error).replace(/_/g,' ')}</span>
                          </span>
                        )}
                      </div>
                      {errorList.map((err, i) => (
                        <div key={i} className="rounded-xl border border-border/40 bg-muted/20 p-3">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${errTypeStyle[err.type] || 'bg-muted text-muted-foreground'}`}>
                            {err.label || err.type}
                          </span>
                          <div className="grid grid-cols-2 gap-3 mt-2">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Original</p>
                              <p className="text-[13px] font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1 break-words">
                                {err.text}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Correction</p>
                              <p className="text-[13px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded px-2 py-1 break-words">
                                {err.suggestion && err.suggestion !== err.text ? err.suggestion : '—'}
                              </p>
                            </div>
                          </div>
                          {err.explanation && (
                            <p className="text-[12px] text-muted-foreground leading-relaxed border-t border-border/30 pt-2 mt-2">
                              {err.explanation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* ── CTA ── */}
                {weakestSkill && (
                  <div className="rounded-2xl glass-sm border border-primary/20 p-4 flex items-center justify-between gap-4 animate-spring-in">
                    <div>
                      <p className="text-[13px] font-semibold text-foreground mb-0.5">
                        Practice {weakestSkill}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Your weakest skill — get a personalised plan to improve it.
                      </p>
                    </div>
                    <Link to="/plan"
                      className="flex-shrink-0 flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
                      Go to Plan <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
