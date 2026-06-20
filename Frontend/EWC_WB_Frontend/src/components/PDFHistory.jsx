import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PageLayout } from './PageLayout';
import { useAuth, getUserId } from '../contexts/AuthContext';
import { getUserDocumentAnalyses } from '../graphql/AIService';
import {
  ArrowLeft, FileText, ChevronRight, AlertCircle,
  CheckCircle, XCircle, Clock, BookOpen, BarChart3, FileSearch,
} from 'lucide-react';
import { PDFHistorySkeleton } from './Skeleton';

const glass = 'glass-md rounded-2xl border border-border/40';

function fmt(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function ScorePill({ value, label }) {
  const pct = Math.round(value || 0);
  const color = pct >= 75 ? 'text-emerald-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400';
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[36px]">
      <span className={`text-xs font-bold ${color}`}>{pct}</span>
      <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

function MiniScoreBar({ value }) {
  const pct = Math.round(value || 0);
  const bg = pct >= 75 ? 'bg-emerald-400' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="w-full h-1 rounded-full bg-muted/60 overflow-hidden">
      <div className={`h-full rounded-full ${bg} transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function LevelBadge({ level }) {
  const colors = {
    A1: 'bg-slate-400/15 text-slate-400 border-slate-400/30',
    A2: 'bg-slate-400/15 text-slate-400 border-slate-400/30',
    B1: 'bg-blue-400/15 text-blue-400 border-blue-400/30',
    B2: 'bg-blue-400/15 text-blue-400 border-blue-400/30',
    C1: 'bg-primary/15 text-primary border-primary/30',
    C2: 'bg-primary/15 text-primary border-primary/30',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold tracking-wide ${colors[level] || 'bg-primary/10 text-primary border-primary/20'}`}>
      {level}
    </span>
  );
}

export function PDFHistory() {
  const { user } = useAuth();
  const userId = getUserId(user);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [offset,  setOffset]  = useState(0);
  const [total,   setTotal]   = useState(0);
  const LIMIT = 10;

  const load = useCallback(async (off = 0) => {
    if (!userId) return;
    setLoading(true); setError(null);
    try {
      const res = await getUserDocumentAnalyses({ User_Id: userId, Limit: LIMIT, Offset: off });
      setRecords(res?.Results || []);
      setTotal(res?.Count || 0);
      setOffset(off);
    } catch (e) {
      setError(e.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(0); }, [load]);

  const avgScore = records.length
    ? Math.round(records.reduce((s, r) => s + (r.Feedback?.Overall_Score || 0), 0) / records.length)
    : null;

  return (
    <PageLayout>
      <div className="space-y-6 max-w-3xl mx-auto" data-page="pdf">

        {/* Back link */}
        <Link to="/pdf-extraction"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />Back to PDF Extraction
        </Link>

        {/* Header card */}
        <div className={`${glass} p-6`}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 border border-primary/20">
              <BookOpen className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground">Extraction History</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {total > 0 ? `${total} document${total !== 1 ? 's' : ''} analysed` : 'No documents yet'}
              </p>
            </div>
            {/* Quick stats */}
            {total > 0 && (
              <div className="hidden sm:flex items-center gap-5 border-l border-border/40 pl-5">
                <div className="text-center">
                  <p className="text-lg font-bold text-primary">{total}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Docs</p>
                </div>
                {avgScore != null && (
                  <div className="text-center">
                    <p className="text-lg font-bold text-emerald-400">{avgScore}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Score</p>
                  </div>
                )}
                <div className="text-center">
                  <BarChart3 className="w-5 h-5 text-primary mx-auto" />
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Stats</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <PDFHistorySkeleton />
        ) : records.length === 0 ? (
          <div className={`${glass} p-14 flex flex-col items-center gap-4 text-center`}>
            <div className="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <FileSearch className="w-10 h-10 text-primary/60" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-base">No extractions yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Upload a PDF to analyse your writing and track progress over time.
              </p>
            </div>
            <Link to="/pdf-extraction"
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
              Extract a PDF
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {records.map(rec => (
                <Link key={rec.Analysis_Id} to={`/pdf-history/${rec.Analysis_Id}`}
                  className={`${glass} p-4 sm:p-5 flex items-center gap-4 hover:border-primary/50 hover:shadow-lg transition-all group block`}
                  style={{ borderLeft: '3px solid var(--primary)' }}>

                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 border border-primary/15 group-hover:bg-primary/20 transition-colors">
                    <FileText className="w-5 h-5" />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground text-sm truncate max-w-[200px] sm:max-w-xs">
                        {rec.File_Name || 'Untitled PDF'}
                      </p>
                      {rec.Status === 'COMPLETED'
                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        : <XCircle    className="w-3.5 h-3.5 text-red-400    flex-shrink-0" />
                      }
                      {rec.Classification?.Level && <LevelBadge level={rec.Classification.Level} />}
                    </div>

                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />{fmt(rec.Created_At)}
                      </span>
                      <span>{rec.Page_Count} page{rec.Page_Count !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Mini score bars */}
                    {rec.Feedback && (
                      <div className="mt-2 grid grid-cols-3 gap-1.5 max-w-[200px]">
                        {[
                          { label: 'Gr', v: rec.Feedback.Grammar_Score },
                          { label: 'Vc', v: rec.Feedback.Vocab_Score },
                          { label: 'Pu', v: rec.Feedback.Punct_Score },
                        ].map(({ label, v }) => (
                          <div key={label}>
                            <div className="flex justify-between mb-0.5">
                              <span className="text-[9px] text-muted-foreground">{label}</span>
                              <span className="text-[9px] text-muted-foreground">{Math.round(v || 0)}</span>
                            </div>
                            <MiniScoreBar value={v} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Overall score */}
                  {rec.Feedback?.Overall_Score != null && (
                    <div className="hidden sm:flex flex-col items-center gap-0.5 flex-shrink-0 px-3 border-l border-border/40">
                      <span className="text-lg font-bold text-primary">{Math.round(rec.Feedback.Overall_Score)}</span>
                      <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Overall</span>
                    </div>
                  )}

                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {total > LIMIT && (
              <div className="flex items-center justify-between pt-2">
                <button disabled={offset === 0} onClick={() => load(offset - LIMIT)}
                  className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40">
                  Previous
                </button>
                <span className="text-xs text-muted-foreground">
                  {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
                </span>
                <button disabled={offset + LIMIT >= total} onClick={() => load(offset + LIMIT)}
                  className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40">
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
