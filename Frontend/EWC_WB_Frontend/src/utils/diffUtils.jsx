import React from 'react';

// Strip trailing/surrounding punctuation for word matching — but NOT apostrophes,
// because contractions like "didn't" vs "didnt" must count as different words.
const strip = w => w.replace(/[.,!?;:()"—–]/g, '').toLowerCase();
function tokenise(t) { return (t || '').split(/(\s+)/); }

/**
 * Paragraph-aware word diff.
 *
 * Problem: the backend often returns corrected text as a single flat paragraph
 * (no \n\n), so splitting both texts by \n\n and diffing per-paragraph fails —
 * it diffs orig-para-1 against the entire corrected string, marks everything
 * green, then shows the remaining orig paragraphs unmodified below.
 *
 * Solution: run ONE flat LCS across the whole text.
 *   - oa: built from tokenise(orig) so original \n\n whitespace tokens are
 *         preserved automatically.
 *   - ca: words of the corrected text with \n\n tokens injected at the
 *         positions that correspond (via the LCS match map) to where paragraph
 *         breaks occur in the original.
 */
export function wordDiff(orig, corr) {
  // ── 1. Tokenise orig, collect word list and paragraph-break positions ────────
  const origTokens = tokenise(orig);
  const origWords  = origTokens.filter(t => t.trim());

  // paraAfterOrigWord[i] = true  →  a \n\n follows the i-th word in orig
  const paraAfterOrigWord = new Set();
  let wi = 0;
  for (let ti = 0; ti < origTokens.length - 1; ti++) {
    if (origTokens[ti].trim()) {
      if (!origTokens[ti + 1].trim() && /\n\n/.test(origTokens[ti + 1])) {
        paraAfterOrigWord.add(wi);
      }
      wi++;
    }
  }

  // ── 2. Flatten corr (backend may strip paragraph breaks) ────────────────────
  const corrWords = corr.split(/\s+/).filter(Boolean);

  // ── 3. LCS ──────────────────────────────────────────────────────────────────
  const m = origWords.length, n = corrWords.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = strip(origWords[i-1]) === strip(corrWords[j-1])
        ? dp[i-1][j-1] + 1
        : Math.max(dp[i-1][j], dp[i][j-1]);

  const origMatchSet = new Set(), corrMatchSet = new Set();
  const origToCorrIdx = new Map(); // orig word idx → corr word idx (for matched pairs)
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (strip(origWords[i-1]) === strip(corrWords[j-1])) {
      origMatchSet.add(i-1); corrMatchSet.add(j-1);
      origToCorrIdx.set(i-1, j-1);
      i--; j--;
    } else if (dp[i-1][j] >= dp[i][j-1]) i--; else j--;
  }

  // ── 4. Map orig paragraph-break positions → corr word positions ─────────────
  // For each paragraph break after orig word oi, find the last LCS-matched
  // word at or before oi, then inject a \n\n after its corresponding corr word.
  const paraAfterCorrWord = new Set();
  for (const oi of paraAfterOrigWord) {
    for (let k = oi; k >= 0; k--) {
      if (origToCorrIdx.has(k)) {
        paraAfterCorrWord.add(origToCorrIdx.get(k));
        break;
      }
    }
  }

  // ── 5. Build oa — preserve original tokens (including \n\n whitespace) ───────
  let wIdx = 0;
  const oa = origTokens.map(t => {
    if (!t.trim()) return { word: t, s: 'space' };
    const s = origMatchSet.has(wIdx) ? 'same' : 'removed';
    wIdx++;
    return { word: t, s };
  });

  // ── 6. Build ca — inject paragraph breaks at mapped positions ───────────────
  const ca = [];
  for (let k = 0; k < corrWords.length; k++) {
    ca.push({ word: corrWords[k], s: corrMatchSet.has(k) ? 'same' : 'added' });
    if (paraAfterCorrWord.has(k)) {
      ca.push({ word: '\n\n', s: 'space' });
    } else if (k < corrWords.length - 1) {
      ca.push({ word: ' ', s: 'space' });
    }
  }

  return { oa, ca };
}

/**
 * Renders a token array produced by wordDiff.
 * mode='orig' → strikethrough red on 'removed' tokens
 * mode='corr' → bold green on 'added' tokens
 */
export function DiffText({ tokens, mode }) {
  return (
    <span className="text-[13px] leading-relaxed whitespace-pre-wrap">
      {tokens.map((tok, i) => {
        if (tok.s === 'space') return <span key={i}>{tok.word}</span>;
        if (mode === 'orig' && tok.s === 'removed')
          return (
            <mark key={i} className="bg-red-500/15 text-red-400 rounded-sm px-0.5 line-through decoration-red-400">
              {tok.word}
            </mark>
          );
        if (mode === 'corr' && tok.s === 'added')
          return (
            <mark key={i} className="bg-emerald-500/15 text-emerald-400 rounded-sm px-0.5 font-semibold">
              {tok.word}
            </mark>
          );
        return <span key={i} className="text-foreground">{tok.word}</span>;
      })}
    </span>
  );
}

/**
 * All-in-one two-panel diff block.
 * Renders "Your Answer" (red strikethrough) and "Corrected" (green highlight)
 * side by side, with the same paragraph structure in both panels.
 */
export function TextDiffPanel({ origText, corrText, origLabel = 'Your Answer', corrLabel = 'Corrected Version' }) {
  if (!origText && !corrText) return null;
  const { oa, ca } = (origText && corrText) ? wordDiff(origText, corrText) : { oa: [], ca: [] };
  return (
    <div className="rounded-xl overflow-hidden border border-border/40">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 bg-muted/10">
        <span className="text-[11px] font-semibold text-foreground flex-1">Text Comparison</span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500/30" />Error (removed)
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/30" />Fixed (added)
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/30">
        <div className="p-4 bg-red-500/5">
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2.5">{origLabel}</p>
          <div className="whitespace-pre-wrap">
            {oa.length
              ? <DiffText tokens={oa} mode="orig" />
              : <span className="text-muted-foreground/50 text-[13px] italic">{origText}</span>}
          </div>
        </div>
        <div className="p-4 bg-emerald-500/5">
          <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2.5">{corrLabel}</p>
          <div className="whitespace-pre-wrap">
            {ca.length
              ? <DiffText tokens={ca} mode="corr" />
              : <span className="text-muted-foreground/50 text-[13px] italic">{corrText}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
