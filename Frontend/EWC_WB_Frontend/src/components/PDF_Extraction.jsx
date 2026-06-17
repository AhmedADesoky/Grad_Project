import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageLayout } from './PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { analyzePdfDocument } from '../graphql/AIService';
import {
  CloudUpload, Sparkles, FileText, ShieldAlert, X,
  ChevronLeft, ChevronRight, Copy, Check, ArrowRight,
} from 'lucide-react';

const glass = 'rounded-3xl glass-md';

/* Radar/Spider chart for 4 skill scores */
function RadarChart({ grammar = 0, vocab = 0, punct = 0, overall = 0 }) {
  const SIZE = 140; const cx = SIZE/2; const cy = SIZE/2; const maxR = 52;
  const axes = [
    { label:'Grammar',     value:grammar, color:'#10B981' },
    { label:'Vocabulary',  value:vocab,   color:'#F59E0B' },
    { label:'Punctuation', value:punct,   color:'#3B82F6' },
    { label:'Overall',     value:overall, color:'var(--primary)' },
  ];
  const angleStep = (2*Math.PI)/axes.length;
  const toXY = (i, r) => ({
    x: cx + r * Math.cos(i*angleStep - Math.PI/2),
    y: cy + r * Math.sin(i*angleStep - Math.PI/2),
  });
  const gridLevels = [0.25,0.5,0.75,1];
  const dataPoints = axes.map((a,i) => toXY(i, (a.value/100)*maxR));
  const polygon = dataPoints.map(p=>`${p.x},${p.y}`).join(' ');
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ overflow:'visible' }}>
      {/* Grid rings */}
      {gridLevels.map(l => {
        const pts = axes.map((_,i)=>toXY(i,l*maxR)).map(p=>`${p.x},${p.y}`).join(' ');
        return <polygon key={l} points={pts} fill="none" stroke="var(--border)" strokeWidth="0.8" opacity="0.5" />;
      })}
      {/* Axis lines */}
      {axes.map((_,i) => {
        const end = toXY(i,maxR);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="var(--border)" strokeWidth="0.8" opacity="0.5" />;
      })}
      {/* Data polygon */}
      <polygon points={polygon} fill="var(--primary)" fillOpacity="0.18" stroke="var(--primary)" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Data dots */}
      {dataPoints.map((p,i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={axes[i].color} stroke="white" strokeWidth="1.2" />
      ))}
      {/* Axis labels */}
      {axes.map((a,i) => {
        const lp = toXY(i, maxR+14);
        return (
          <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fontWeight="600" fill="var(--muted-foreground)">
            {a.label.slice(0,5)} {a.value}
          </text>
        );
      })}
    </svg>
  );
}

function parseMaybeJson(v) {
  if (!v) return v; if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}
function readBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ''));
    r.onerror = () => rej(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

function parseScores(feedback) {
  if (!feedback) return null;
  const raw = feedback.Scores;
  const s = raw && typeof raw === 'object' ? raw
    : raw ? (() => { try { return JSON.parse(raw); } catch { return {}; } })()
    : {};
  const n = (v) => Math.round(Number(v || 0));
  const grammar = n(s.grammar_score ?? s.Grammar_Score ?? s.grammar ?? 0);
  const vocab   = n(s.vocab_score   ?? s.Vocab_Score   ?? s.vocab   ?? 0);
  const punct   = n(s.punct_score   ?? s.Punct_Score   ?? s.punct   ?? 0);
  const overall = n(s.overall_score ?? s.Overall_Score ?? s.overall ?? 0);
  return (grammar + vocab + punct + overall) > 0 ? { grammar, vocab, punct, overall } : null;
}

function tokenise(t) { return (t || '').split(/(\s+)/); }
function wordDiff(orig, corr) {
  const strip = w => w.replace(/[.,!?;:()"']/g, '').toLowerCase();
  const ow = tokenise(orig).filter(t => t.trim());
  const cw = tokenise(corr).filter(t => t.trim());
  const m = ow.length, n = cw.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = strip(ow[i - 1]) === strip(cw[j - 1]) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const mo = new Set(), mc = new Set();
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (strip(ow[i - 1]) === strip(cw[j - 1])) { mo.add(i - 1); mc.add(j - 1); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
  }
  let wi = 0;
  const oa = tokenise(orig).map(t => { if (!t.trim()) return { word: t, s: 'space' }; const s = mo.has(wi) ? 'same' : 'removed'; wi++; return { word: t, s }; });
  let wj = 0;
  const ca = tokenise(corr).map(t => { if (!t.trim()) return { word: t, s: 'space' }; const s = mc.has(wj) ? 'same' : 'added'; wj++; return { word: t, s }; });
  return { oa, ca };
}

function DiffText({ tokens, mode }) {
  return (
    <span className="text-[13px] leading-relaxed">
      {tokens.map((tok, i) => {
        if (tok.s === 'space') return <span key={i}>{tok.word}</span>;
        if (mode === 'orig' && tok.s === 'removed') return <mark key={i} className="bg-red-100 text-red-800 dark:bg-red-900/35 dark:text-red-300 rounded-sm px-0.5 line-through decoration-red-400 underline underline-offset-2">{tok.word}</mark>;
        if (mode === 'corr' && tok.s === 'added') return <mark key={i} className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/35 dark:text-emerald-300 rounded-sm px-0.5 font-semibold">{tok.word}</mark>;
        return <span key={i} className="text-foreground">{tok.word}</span>;
      })}
    </span>
  );
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

export function PDF_Extraction() {
  const { user } = useAuth();
  const autoUserId = useMemo(() => user?.id || user?._id || user?.User_Id || '', [user]);

  const [dragging,     setDragging]     = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName,     setFileName]     = useState('');
  const [useOCR,       setUseOCR]       = useState(true);
  const [saveToDb,     setSaveToDb]     = useState(true);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [result,       setResult]       = useState(null);
  const [currentPage,  setCurrentPage]  = useState(0);
  const [copied,       setCopied]       = useState(false);

  const onFile = (file) => {
    if (!file || file.type !== 'application/pdf') { setError('Please select a valid PDF file.'); return; }
    setSelectedFile(file); setFileName(file.name); setError(''); setResult(null); setCurrentPage(0);
  };
  const onDrop = useCallback(e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }, []);

  const submit = async e => {
    e.preventDefault(); setError(''); setResult(null); setCurrentPage(0);
    if (!selectedFile) { setError('Please upload a PDF file.'); return; }
    if (!autoUserId)   { setError('No authenticated user. Please sign in again.'); return; }
    try {
      setLoading(true);
      const b64 = await readBase64(selectedFile);
      const r = await analyzePdfDocument({
        Pdf_Base64: b64, Pdf_Path: null, Pdf_Url: null,
        File_Name: fileName || selectedFile.name,
        User_Id: autoUserId, Save_To_Database: saveToDb, Use_OCR: useOCR,
      });
      if (!r?.Success) throw new Error(r?.Error || 'Analysis failed');
      setResult(r.Result);
    } catch (err) { setError(err.message || 'Unexpected error'); }
    finally { setLoading(false); }
  };

  const pageResults    = Array.isArray(parseMaybeJson(result?.Page_Results)) ? parseMaybeJson(result?.Page_Results) : [];
  const detectedIssues = parseMaybeJson(result?.Feedback?.Detected_Issues) || [];
  const corrText       = result?.Feedback?.Corrected_Text || '';
  const origText       = corrText ? (pageResults[currentPage]?.text || '') : '';
  const { oa, ca }     = corrText && origText ? wordDiff(origText, corrText) : { oa: [], ca: [] };
  const scores         = parseScores(result?.Feedback);

  const weakestSkill = scores
    ? Object.entries({ Grammar: scores.grammar, Vocabulary: scores.vocab, Punctuation: scores.punct })
        .sort((a, b) => a[1] - b[1])[0]?.[0]
    : null;

  const handleCopy = () => {
    navigator.clipboard.writeText(corrText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const ISSUE_STYLE = {
    grammar:     'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    punctuation: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    vocabulary:  'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    spelling:    'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800',
  };

  return (
    <PageLayout>
      <div className="max-w-5xl mx-auto space-y-5" data-page="pdf">

        {/* Header */}
        <div className={`${glass} p-5 animate-spring-in`}>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55 font-semibold mb-1">Document Intelligence</p>
          <h1 className="text-xl font-bold text-foreground">PDF Extraction & Analysis</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Upload a PDF, extract text with OCR fallback, then get grammar corrections and CEFR classification.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">

          {/* Upload form */}
          <form onSubmit={submit} className="space-y-4">
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              className={`glass-sm rounded-2xl border-2 border-dashed transition-spring cursor-pointer p-8 text-center ${
                dragging ? 'border-primary bg-primary/10 scale-[1.02]' :
                selectedFile ? 'border-emerald-500/50 bg-emerald-500/5' :
                'border-border/50 hover:border-primary/50 hover:bg-primary/5'
              }`}
              style={{ borderRadius:'1.25rem' }}
              onClick={() => document.getElementById('pdf-input').click()}
            >
              <CloudUpload className={`w-10 h-10 mx-auto mb-3 transition-colors ${dragging ? 'text-primary' : 'text-muted-foreground/50'}`} />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-[13px] font-medium text-foreground truncate max-w-[180px]">{selectedFile.name}</span>
                  <button type="button" onClick={e => { e.stopPropagation(); setSelectedFile(null); setFileName(''); setResult(null); }}
                    className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-[13px] font-medium text-foreground mb-1">Drop your PDF here</p>
                  <p className="text-[11px] text-muted-foreground">or click to browse · up to 20MB · OCR enabled</p>
                </>
              )}
            </div>
            <input id="pdf-input" type="file" accept="application/pdf" onChange={e => onFile(e.target.files?.[0])} className="hidden" />

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'OCR fallback',  checked: useOCR,    set: setUseOCR   },
                { label: 'Save history',  checked: saveToDb,  set: setSaveToDb },
              ].map(({ label, checked, set }) => (
                <label key={label} className="flex items-center justify-between rounded-xl border border-border/50 bg-background px-3 py-2.5 text-[12px] text-foreground cursor-pointer hover:bg-muted/30 transition-colors">
                  {label}
                  <div onClick={() => set(!checked)} className={`w-8 rounded-full flex items-center transition-colors px-0.5 cursor-pointer ${checked ? 'bg-primary' : 'bg-muted'}`} style={{ height: 18 }}>
                    <div className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </div>
                </label>
              ))}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-[13px] text-destructive">
                <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
              </div>
            )}

            <button type="submit" disabled={loading || !selectedFile}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
              {loading
                ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Analysing…</>
                : <><Sparkles className="w-4 h-4" />Analyse Document</>}
            </button>
          </form>

          {/* Results */}
          <div className="space-y-4">

            {/* Skill scores — radar chart */}
            {scores ? (
              <div className="glass-sm rounded-2xl p-4 animate-spring-in" style={{ borderRadius:'1rem' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Skill scores</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {result?.Classification?.Level && (
                      <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                        {result.Classification.Level}
                      </span>
                    )}
                    {result?.Extraction_Tool && (
                      <span className="text-[10px] text-muted-foreground/60 bg-muted/40 px-2 py-0.5 rounded-full">{result.Extraction_Tool}</span>
                    )}
                    {result?.Page_Count != null && (
                      <span className="text-[10px] text-muted-foreground/60 bg-muted/40 px-2 py-0.5 rounded-full">{result.Page_Count}p</span>
                    )}
                  </div>
                </div>
                {/* Radar chart centred */}
                <div className="flex flex-col items-center gap-3">
                  <RadarChart grammar={scores.grammar} vocab={scores.vocab} punct={scores.punct} overall={scores.overall} />
                  {/* Compact score pills */}
                  <div className="flex flex-wrap gap-2 justify-center">
                    {[
                      { label:'Grammar',     value:scores.grammar, cls:'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
                      { label:'Vocabulary',  value:scores.vocab,   cls:'bg-amber-500/10 text-amber-700 dark:text-amber-400'   },
                      { label:'Punctuation', value:scores.punct,   cls:'bg-blue-500/10 text-blue-700 dark:text-blue-400'     },
                      ...(scores.overall > 0 ? [{ label:'Overall', value:scores.overall, cls:'bg-primary/10 text-primary' }] : []),
                    ].map(s => (
                      <span key={s.label} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border border-current/20 ${s.cls}`}>
                        {s.label} {s.value}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : result ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Pages',      value: result?.Page_Count ?? '—',                                                          color: 'text-foreground' },
                  { label: 'Level',      value: result?.Classification?.Level || '—',                                               color: 'text-amber-700 dark:text-amber-300' },
                  { label: 'Confidence', value: result?.Classification?.Confidence ? `${(result.Classification.Confidence * 100).toFixed(0)}%` : '—', color: 'text-foreground' },
                  { label: 'Tool',       value: result?.Extraction_Tool || '—',                                                     color: 'text-foreground' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl bg-muted/30 border border-border/40 p-3">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{s.label}</p>
                    <p className={`text-[15px] font-semibold truncate ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Issues */}
            {detectedIssues.length > 0 && (
              <div className="rounded-xl border border-border/40 bg-card p-4">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Detected issues</p>
                <div className="flex flex-wrap gap-2">
                  {detectedIssues.map((issue, i) => (
                    <span key={i} className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border ${ISSUE_STYLE[(issue || '').toLowerCase()] || 'bg-muted text-muted-foreground border-border'}`}>
                      {issue}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Diff panel */}
            {(oa.length > 0 || corrText) && (
              <div className="rounded-xl border border-border/40 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/30 border-b border-border/40 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground flex-1">Text comparison</span>
                  {/* Page navigation */}
                  {pageResults.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}
                        className="p-1 rounded-lg hover:bg-muted/60 disabled:opacity-30 transition-colors">
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[11px] font-medium text-foreground">Page {currentPage + 1}/{pageResults.length}</span>
                      <button onClick={() => setCurrentPage(p => Math.min(pageResults.length - 1, p + 1))} disabled={currentPage === pageResults.length - 1}
                        className="p-1 rounded-lg hover:bg-muted/60 disabled:opacity-30 transition-colors">
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-red-200 dark:bg-red-900/50" />Errors</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-200 dark:bg-emerald-900/50" />Fixed</span>
                  {/* Copy corrected text */}
                  {corrText && (
                    <button onClick={handleCopy}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-muted/60 transition-colors">
                      {copied
                        ? <><Check className="w-3.5 h-3.5 text-emerald-500" /><span className="text-emerald-500 text-[10px]">Copied</span></>
                        : <><Copy className="w-3.5 h-3.5" /><span className="text-[10px]">Copy</span></>}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/40">
                  <div className="p-4 bg-red-50/30 dark:bg-red-950/10">
                    <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-2">Your text</p>
                    <div className="whitespace-pre-wrap">
                      {oa.length ? <DiffText tokens={oa} mode="orig" /> : <span className="text-muted-foreground text-[13px] italic">No original text</span>}
                    </div>
                  </div>
                  <div className="p-4 bg-emerald-50/30 dark:bg-emerald-950/10">
                    <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-2">Corrected</p>
                    <div className="whitespace-pre-wrap">
                      {ca.length ? <DiffText tokens={ca} mode="corr" /> : corrText ? <span className="text-[13px] text-foreground">{corrText}</span> : <span className="text-muted-foreground text-[13px] italic">No correction yet</span>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Practice this skill CTA */}
            {result && weakestSkill && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[12px] font-semibold text-foreground mb-0.5">Practice {weakestSkill}</p>
                  <p className="text-[11px] text-muted-foreground">Your weakest skill — get a personalised practice plan.</p>
                </div>
                <Link to="/plan"
                  className="flex items-center gap-1.5 flex-shrink-0 rounded-xl bg-primary px-3.5 py-2 text-[12px] font-semibold text-primary-foreground hover:opacity-90 transition-opacity">
                  Go to Plan <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}

            {!result && !loading && (
              <div className="rounded-xl border border-dashed border-border/50 p-10 text-center">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-[13px] text-muted-foreground">Upload a PDF to see analysis results here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
