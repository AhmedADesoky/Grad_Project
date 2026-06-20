"""
Multi-head Feedback Analyzer v2.

Architecture:
  Encoder : DeBERTa-v3-base  → span_head (BIO error tagger, 13 labels)
                              → score_head (regression, 2 quality scores)
  Pattern : 2-layer LSTM      → dominant error category + trend
  Decoder : Flan-T5-base      → full corrected text

Error categories (BIO):
  GRAM  – grammar errors
  SPELL – spelling mistakes
  PUNCT – punctuation issues
  VOCAB – vocabulary / word-choice problems
  WO    – word-order errors
  STYLE – style / register issues
"""

import difflib
import logging
import math
import re
from collections import Counter
from pathlib import Path

import torch
import torch.nn as nn

Logger = logging.getLogger(__name__)

_WEIGHTS_DIR = (
    Path(__file__).resolve().parents[4]
    / "Models_Weights"
    / "FeedBack_Model"
    / "multi_head_feedback_model_v2"
    / "multi_head_feedback_model_v2"
)

# ── Head modules ──────────────────────────────────────────────────────────────

class _SpanHead(nn.Module):
    """Token-level BIO classifier: DeBERTa hidden (768) → 13 labels."""
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Dropout(0.1),
            nn.Linear(768, 384),   # idx 1
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(384, 13),    # idx 4
        )

    def forward(self, x):
        return self.net(x)


class _ScoreHead(nn.Module):
    """[CLS] regression → [severity, fluency]. Sigmoid applied in usage."""
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Dropout(0.1),
            nn.Linear(768, 256),   # idx 1
            nn.GELU(),
            nn.Linear(256, 2),     # idx 3
        )

    def forward(self, x):
        return self.net(x)


class _PatternHead(nn.Module):
    """
    Head 4 — WritingPatternProfiler. 2-layer LSTM over a sliding window of
    per-submission coarse error vectors → recurring-pattern logits + trend.
    Replicated exactly from the training notebook.
    """
    def __init__(self, num_coarse=6, hidden_dim=128, max_history=20):
        super().__init__()
        self.max_history = max_history
        self.num_coarse  = num_coarse
        self.lstm = nn.LSTM(
            input_size=num_coarse, hidden_size=hidden_dim,
            num_layers=2, batch_first=True, dropout=0.1,
        )
        self.pattern_proj = nn.Linear(hidden_dim, num_coarse)
        self.trend_proj   = nn.Linear(hidden_dim, 3)

    def forward(self, error_vec, history=None):
        B = error_vec.size(0)
        if history is None:
            history = torch.zeros(B, 1, self.num_coarse, device=error_vec.device)
        current  = error_vec.unsqueeze(1)                 # (B, 1, C)
        new_hist = torch.cat([history, current], dim=1)   # (B, H+1, C)
        if new_hist.size(1) > self.max_history:
            new_hist = new_hist[:, -self.max_history:, :]
        lstm_out, _ = self.lstm(new_hist)
        last = lstm_out[:, -1, :]
        return new_hist.detach(), self.pattern_proj(last), self.trend_proj(last)


# ── Label maps ────────────────────────────────────────────────────────────────

_LABEL2ID = {
    'O': 0,
    'B-GRAM': 1, 'I-GRAM': 2,
    'B-SPELL': 3, 'I-SPELL': 4,
    'B-PUNCT': 5, 'I-PUNCT': 6,
    'B-VOCAB': 7, 'I-VOCAB': 8,
    'B-WO': 9,  'I-WO': 10,
    'B-STYLE': 11, 'I-STYLE': 12,
}
_ID2LABEL = {v: k for k, v in _LABEL2ID.items()}

_COARSE_LABELS  = ['grammar', 'spelling', 'punctuation', 'vocabulary', 'word_order', 'style']
_FINE_TO_COARSE = {1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 3, 9: 4, 10: 4, 11: 5, 12: 5}

# ── Inference constants (must match the training notebook) ──────────────────────
_MAX_SEQ_LEN  = 256
_MAX_GEN_LEN  = 128
_TREND_LABELS = ['improving', 'stable', 'deteriorating']
_BIO_TO_COARSE_NAME = {
    'GRAM': 'grammar', 'SPELL': 'spelling', 'PUNCT': 'punctuation',
    'VOCAB': 'vocabulary', 'WO': 'word_order', 'STYLE': 'style',
}
_COARSE_NAME_TO_IDX = {n: i for i, n in enumerate(_COARSE_LABELS)}
_COARSE_NAME_TO_BIO = {v: k for k, v in _BIO_TO_COARSE_NAME.items()}

# Severity weight per error category — how much one error of this type lowers
# the score. A grammar/word-order error is most serious; a missing comma least.
_TYPE_PENALTY = {
    'grammar':     1.0,
    'word_order':  1.0,
    'vocabulary':  0.9,
    'spelling':    0.7,
    'style':       0.5,
    'punctuation': 0.5,
}

_ERROR_DISPLAY = {
    'GRAM':  'Grammar',
    'SPELL': 'Spelling',
    'PUNCT': 'Punctuation',
    'VOCAB': 'Vocabulary',
    'WO':    'Word Order',
    'STYLE': 'Style',
}

_EXPLANATION_TEMPLATES = {
    'GRAM':  "Grammar error: '{original}' should be '{correction}' — check subject-verb agreement, tense, or sentence structure.",
    'SPELL': "Spelling mistake: '{original}' is misspelled. The correct form is '{correction}'.",
    'PUNCT': "Punctuation issue: '{original}' needs punctuation adjustment — corrected to '{correction}'.",
    'VOCAB': "Word choice: '{original}' is an incorrect or unusual word here. '{correction}' is more appropriate.",
    'WO':    "Word order: '{original}' is in the wrong position. The correct order is '{correction}'.",
    'STYLE': "Style: '{original}' sounds unnatural or informal. '{correction}' is clearer.",
}


# ── Main class ────────────────────────────────────────────────────────────────

class Feedback_Analyzer:

    def __init__(self):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        Logger.info('Loading Feedback v2 on %s …', self.device)
        self._load_encoder()
        self._load_heads()
        self._load_t5()
        self._load_spell()
        Logger.info('Feedback v2 ready.')

    def _load_spell(self):
        try:
            from spellchecker import SpellChecker
            self.spell = SpellChecker()
            Logger.info('Spelling post-filter loaded.')
        except Exception as exc:
            Logger.warning('pyspellchecker unavailable (%s) — spelling filter disabled', exc)
            self.spell = None

    # ── Model loading ─────────────────────────────────────────────────────────

    def _load_encoder(self):
        from transformers import AutoTokenizer, AutoModel
        enc_path = str(_WEIGHTS_DIR / 'encoder')
        self.enc_tokenizer = AutoTokenizer.from_pretrained(enc_path, local_files_only=True)
        self.encoder = AutoModel.from_pretrained(enc_path, local_files_only=True)
        self.encoder.to(self.device).eval()
        Logger.info('DeBERTa encoder loaded.')

    def _load_heads(self):
        data = torch.load(str(_WEIGHTS_DIR / 'heads.pt'), map_location='cpu', weights_only=False)

        self.span_head = _SpanHead()
        self.span_head.net.load_state_dict(data['span_head'])
        self.span_head.to(self.device).eval()

        self.score_head = _ScoreHead()
        self.score_head.net.load_state_dict(data['score_head'])
        self.score_head.to(self.device).eval()

        self.pattern_head = _PatternHead()
        self.pattern_head.load_state_dict(data['pattern_head'])
        self.pattern_head.to(self.device).eval()
        Logger.info('Heads loaded (span, score, pattern).')

    def _load_t5(self):
        import warnings
        from transformers import AutoTokenizer, T5ForConditionalGeneration
        t5_path = str(_WEIGHTS_DIR / 't5')
        self.t5_tokenizer = AutoTokenizer.from_pretrained(t5_path, local_files_only=True)
        # The checkpoint stores both shared.weight and lm_head.weight separately
        # (a training artefact), triggering a harmless HuggingFace warning.
        # Suppress it and load with default tie_word_embeddings=True so the model
        # actually uses the saved embeddings instead of randomly-initialised ones.
        with warnings.catch_warnings():
            warnings.filterwarnings('ignore', message='.*lm_head.*')
            warnings.filterwarnings('ignore', message='.*shared.*')
            warnings.filterwarnings('ignore', message='.*tied.*')
            self.t5 = T5ForConditionalGeneration.from_pretrained(
                t5_path, local_files_only=True
            )
        self.t5.to(self.device).eval()
        Logger.info('Flan-T5 loaded.')

    # ── Head 1: BIO span detection (windowed over long text) ───────────────────

    def _detect_error_spans(self, words: list) -> list:
        """
        Run the trained DeBERTa encoder + span_head exactly as in training:
        words are fed with is_split_into_words=True, predictions are aligned back
        to words via word_ids (first sub-token per word wins).

        Long documents are processed in 200-word windows so the 256-token limit
        never silently drops the tail of a PDF.
        """
        WINDOW = 200
        error_spans = []

        for w0 in range(0, len(words), WINDOW):
            chunk = words[w0:w0 + WINDOW]
            enc = self.enc_tokenizer(
                chunk, is_split_into_words=True,
                max_length=_MAX_SEQ_LEN, padding='max_length',
                truncation=True, return_tensors='pt',
            )
            word_ids = enc.word_ids(0)
            input_ids = enc['input_ids'].to(self.device)
            attention_mask = enc['attention_mask'].to(self.device)

            with torch.no_grad():
                seq_repr = self.encoder(
                    input_ids=input_ids, attention_mask=attention_mask
                ).last_hidden_state
                span_preds = self.span_head(seq_repr).argmax(-1).squeeze(0).cpu().tolist()

            # First sub-token label per word
            word_label = {}
            for tok_i, wid in enumerate(word_ids):
                if wid is not None and wid not in word_label:
                    word_label[wid] = _ID2LABEL.get(int(span_preds[tok_i]), 'O')

            for wid, lbl in sorted(word_label.items()):
                if lbl == 'O':
                    continue
                coarse = lbl.split('-')[1] if '-' in lbl else lbl
                error_spans.append({
                    'word':       chunk[wid] if wid < len(chunk) else '?',
                    'position':   w0 + wid,                       # global word index
                    'bio_label':  lbl,
                    'error_type': _BIO_TO_COARSE_NAME.get(coarse, coarse.lower()),
                })

        return error_spans

    # ── Head 4: writing-pattern profiler ───────────────────────────────────────

    def _profile_patterns(self, error_spans: list, n_words: int) -> tuple:
        err_vec = [0.0] * len(_COARSE_LABELS)
        for es in error_spans:
            err_vec[_COARSE_NAME_TO_IDX.get(es['error_type'], 0)] += 1.0
        err_vec_t = torch.tensor(
            [[v / max(n_words, 1) for v in err_vec]], dtype=torch.float, device=self.device
        )
        with torch.no_grad():
            _, pattern_logits, trend_logits = self.pattern_head(err_vec_t, None)
        pattern_probs = torch.softmax(pattern_logits, dim=-1).squeeze(0).cpu().tolist()
        trend_probs   = torch.softmax(trend_logits, dim=-1).squeeze(0).cpu().tolist()

        user_trend = _TREND_LABELS[int(max(range(3), key=lambda i: trend_probs[i]))]
        recurring = sorted(
            [
                {'error_type': _COARSE_LABELS[i], 'recurrence_score': round(p, 3), 'trend': user_trend}
                for i, p in enumerate(pattern_probs) if p > 0.10
            ],
            key=lambda x: -x['recurrence_score'],
        )
        return recurring, user_trend

    # ── Head 2: severity + fluency ─────────────────────────────────────────────

    def _severity_fluency(self, words: list) -> tuple:
        enc = self.enc_tokenizer(
            words[:200], is_split_into_words=True,
            max_length=_MAX_SEQ_LEN, padding='max_length',
            truncation=True, return_tensors='pt',
        )
        with torch.no_grad():
            seq = self.encoder(
                input_ids=enc['input_ids'].to(self.device),
                attention_mask=enc['attention_mask'].to(self.device),
            ).last_hidden_state
            raw = torch.sigmoid(self.score_head(seq[:, 0, :])).squeeze(0).cpu().tolist()
        return round(float(raw[0]), 4), round(float(raw[1]), 4)   # severity, fluency

    # ── Head 5a: GEC correction (T5 with the trained 'gec:' prefix) ─────────────

    def _gec_correct_sentence(self, sentence: str) -> str:
        enc = self.t5_tokenizer(
            f'gec: {sentence}',
            max_length=_MAX_SEQ_LEN, truncation=True, return_tensors='pt',
        ).to(self.device)
        with torch.no_grad():
            ids = self.t5.generate(
                input_ids=enc.input_ids, attention_mask=enc.attention_mask,
                max_new_tokens=_MAX_GEN_LEN, num_beams=4,
                early_stopping=True, no_repeat_ngram_size=3,
            )
        out = self.t5_tokenizer.decode(ids[0], skip_special_tokens=True).strip()
        if not out:
            return sentence
        # Reliability guard against dropped/doubled output on a single sentence
        ow, cw = len(sentence.split()), len(out.split())
        if cw < ow * 0.5 or cw > ow * 2.0 + 5:
            return sentence
        return out

    def _gec_correct(self, text: str) -> str:
        # Split on any newline(s) to get logical paragraphs/lines, correct each
        # independently, then re-join with double newlines so the corrected text
        # has visible paragraph breaks matching the original's structure.
        paragraphs = [p.strip() for p in re.split(r'\n+', text) if p.strip()]
        if not paragraphs:
            return text
        corrected_paragraphs = []
        for para in paragraphs:
            sentences = re.split(r'(?<=[.!?])\s+', para)
            sentences = [s.strip() for s in sentences if s.strip()]
            corrected_paragraphs.append(
                ' '.join(self._gec_correct_sentence(s) for s in sentences) if sentences else para
            )
        return '\n\n'.join(corrected_paragraphs).strip()

    # ── Selective GEC: only keep T5 corrections where BIO detector flagged ───────

    def _apply_gec_selectively(self, original_text: str, gec_corrected: str, error_spans: list) -> str:
        # If DeBERTa found any errors in the text, trust T5's full output —
        # the student has real writing issues and T5 corrections are reliable.
        # Only when DeBERTa found zero errors do we restrict T5 (to protect
        # fluent C1/C2 text from T5 hallucinations).
        all_flagged = {es['position'] for es in error_spans}
        if all_flagged:
            return gec_corrected

        # Zero DeBERTa flags: only let pure capitalization fixes through.
        # (DeBERTa never tags capitalisation in BIO labels but T5 reliably
        # fixes sentence-initial 'i' and other case errors.)
        orig_words = original_text.split()
        corr_words = gec_corrected.split()
        sm = difflib.SequenceMatcher(None, orig_words, corr_words, autojunk=False)
        result = []
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == 'equal':
                result.extend(orig_words[i1:i2])
                continue
            if (tag == 'replace' and i2 - i1 == 1 and j2 - j1 == 1
                    and orig_words[i1].lower() == corr_words[j1].lower()
                    and orig_words[i1] != corr_words[j1]):
                result.append(corr_words[j1])
                continue
            result.extend(orig_words[i1:i2])
        return ' '.join(result)

    # ── Rule-based post-corrections (what T5-base misses) ────────────────────

    # Contractions that T5 leaves un-apostrophised.  Matched case-insensitively;
    # first letter capitalisation is preserved in the output.
    _CONTRACTION_MAP: dict[str, str] = {
        "dont":    "don't",
        "wont":    "won't",
        "cant":    "can't",
        "didnt":   "didn't",
        "doesnt":  "doesn't",
        "isnt":    "isn't",
        "arent":   "aren't",
        "wasnt":   "wasn't",
        "werent":  "weren't",
        "havent":  "haven't",
        "hasnt":   "hasn't",
        "hadnt":   "hadn't",
        "wouldnt": "wouldn't",
        "shouldnt": "shouldn't",
        "couldnt": "couldn't",
        "mustnt":  "mustn't",
        "neednt":  "needn't",
        "aint":    "ain't",
    }

    # Two-word forms that should be one word in standard English.
    _COMPOUND_FIXES: list[tuple] = [
        (r'\bevery\s+thing\b',  'everything'),
        (r'\bsome\s+thing\b',   'something'),
        (r'\bany\s+thing\b',    'anything'),
        (r'\bno\s+thing\b',     'nothing'),
        (r'\bevery\s+one\b',    'everyone'),
        (r'\bsome\s+one\b',     'someone'),
        (r'\bany\s+one\b',      'anyone'),
        (r'\bevery\s+body\b',   'everybody'),
        (r'\bsome\s+body\b',    'somebody'),
        (r'\bany\s+body\b',     'anybody'),
        (r'\bevery\s+where\b',  'everywhere'),
        (r'\bsome\s+where\b',   'somewhere'),
        (r'\bany\s+where\b',    'anywhere'),
        (r'\bno\s+where\b',     'nowhere'),
        (r'\bover\s+all\b',     'overall'),
        (r'\bunder\s+stand\b',  'understand'),
        (r'\bwith\s+out\b',     'without'),
        (r'\bwith\s+in\b',      'within'),
        (r'\bal\s+though\b',    'although'),
        (r'\bal\s+ready\b',     'already'),
        (r'\bal\s+ways\b',      'always'),
        (r'\bto\s+day\b',       'today'),
        (r'\bto\s+night\b',     'tonight'),
        (r'\bto\s+morrow\b',    'tomorrow'),
        (r'\bto\s+gether\b',    'together'),
        (r'\bto\s+ward\b',      'toward'),
        (r'\bby\s+self\b',      'byself'),   # myself/yourself handled below
        (r'\bmy\s+self\b',      'myself'),
        (r'\byour\s+self\b',    'yourself'),
        (r'\bhim\s+self\b',     'himself'),
        (r'\bher\s+self\b',     'herself'),
        (r'\bit\s+self\b',      'itself'),
        (r'\bour\s+selves\b',   'ourselves'),
        (r'\byour\s+selves\b',  'yourselves'),
        (r'\bthem\s+selves\b',  'themselves'),
    ]

    def _rule_correct(self, text: str) -> str:
        # 1. Compound-word splits
        for pattern, replacement in self._COMPOUND_FIXES:
            def _repl(m, r=replacement):
                # preserve capitalisation of first char
                return r[0].upper() + r[1:] if m.group(0)[0].isupper() else r
            text = re.sub(pattern, _repl, text, flags=re.IGNORECASE)

        # 2. Missing apostrophes in contractions (word-boundary aware)
        def _fix_contraction(m):
            word = m.group(0)
            fixed = self._CONTRACTION_MAP[word.lower()]
            return fixed[0].upper() + fixed[1:] if word[0].isupper() else fixed

        pattern = r'\b(' + '|'.join(re.escape(k) for k in self._CONTRACTION_MAP) + r')\b'
        text = re.sub(pattern, _fix_contraction, text, flags=re.IGNORECASE)

        return text

    # ── Head 5b: model-generated feedback / explanation ────────────────────────

    def _generate_feedback(self, text: str, cefr_level: str = 'B1') -> str:
        """
        Head 5b — the SAME fine-tuned Flan-T5 produces a natural-language
        explanation of the writing, using the 'feedback CEFR {level}:' prefix it
        was trained on. This is model-generated, not template-based.
        """
        # Cap the input so a long PDF doesn't overflow the 256-token window
        snippet = ' '.join(text.split()[:200])
        enc = self.t5_tokenizer(
            f'feedback CEFR {cefr_level}: {snippet}',
            max_length=_MAX_SEQ_LEN, truncation=True, return_tensors='pt',
        ).to(self.device)
        with torch.no_grad():
            ids = self.t5.generate(
                input_ids=enc.input_ids, attention_mask=enc.attention_mask,
                max_new_tokens=_MAX_GEN_LEN, num_beams=4,
                early_stopping=True, no_repeat_ngram_size=3,
            )
        return self.t5_tokenizer.decode(ids[0], skip_special_tokens=True).strip()


    # ── Head 3: spelling post-filter ───────────────────────────────────────────

    def _spelling_filter(self, text: str) -> tuple:
        if self.spell is None:
            return text, []
        words = text.split()
        out, errs = [], []
        # Exclude words that are already correct irregular-verb fixes so the spell
        # checker doesn't re-flag them (e.g. "spoke" after we corrected "speaked").
        _known_correct = set(self._IRREGULAR_VERB_FIX.values())
        # Skip short words (< 6 chars) from spell-checking: short words are far
        # more likely to be proper nouns (Messi, Arya, Obama, Rome) than typos,
        # and the checker suggests wrong common words like mess/area instead.
        misspelled = self.spell.unknown([
            w for w in words
            if re.match(r'^[a-zA-Z]+$', w) and w.lower() not in _known_correct
            and len(w) >= 6
        ])
        for i, word in enumerate(words):
            clean = re.sub(r'[^a-zA-Z]', '', word)
            # Skip proper nouns (capitalised words) — spell checker doesn't know names
            if clean[:1].isupper():
                out.append(word)
                continue
            if clean.lower() in misspelled:
                sug = self.spell.correction(clean.lower())
                if sug and sug != clean.lower():
                    if word[:1].isupper():
                        sug = sug.capitalize()
                    out.append(word.replace(clean, sug))
                    errs.append({'position': i, 'original': word, 'correction': sug, 'type': 'spelling'})
                    continue
            out.append(word)
        return ' '.join(out), errs

    # ── British ⇄ American dialect detection ───────────────────────────────────

    # British/American irregular verb past-tense pairs (both directions).
    # e.g. smelled↔smelt, burned↔burnt, learned↔learnt …
    _DIALECT_VERB_PAIRS = {
        frozenset(["smelled", "smelt"]),
        frozenset(["spelled", "spelt"]),
        frozenset(["burned", "burnt"]),
        frozenset(["learned", "learnt"]),
        frozenset(["dreamed", "dreamt"]),
        frozenset(["kneeled", "knelt"]),
        frozenset(["leaped", "leapt"]),
        frozenset(["leaned", "leant"]),
        frozenset(["spoiled", "spoilt"]),
        frozenset(["spilled", "spilt"]),
        frozenset(["dwelled", "dwelt"]),
        frozenset(["bereaved", "bereft"]),
        frozenset(["sped", "speeded"]),
    }

    @staticmethod
    def _is_dialect_variant(orig: str, corr: str) -> bool:
        # True if orig->corr is only a British/American spelling difference.
        o = orig.strip().strip("'\".,;:").lower()
        c = corr.strip().strip("'\".,;:").lower()

        # Check irregular verb British/American -ed/-t pairs first
        if frozenset({o, c}) in Feedback_Analyzer._DIALECT_VERB_PAIRS:
            return True

        if not o or not c or o == c:
            # punctuation/quote-only change around identical letters → treat as dialect/style
            return re.sub(r'[^a-z]', '', orig.lower()) == re.sub(r'[^a-z]', '', corr.lower()) and orig != corr

        def normalize(w):
            # Collapse common British forms to American
            w = re.sub(r'isation\b', 'ization', w)
            w = re.sub(r'ise\b', 'ize', w)
            w = re.sub(r'ised\b', 'ized', w)
            w = re.sub(r'ising\b', 'izing', w)
            w = re.sub(r'yse\b', 'yze', w)            # analyse→analyze
            w = re.sub(r'ysed\b', 'yzed', w)          # analysed→analyzed
            w = re.sub(r'ysing\b', 'yzing', w)        # analysing→analyzing
            w = re.sub(r'yses\b', 'yzes', w)          # analyses→analyzes
            w = re.sub(r'mme\b', 'm', w)              # programme→program, gramme→gram
            w = re.sub(r'mmes\b', 'ms', w)            # programmes→programs
            w = re.sub(r'ourful\b', 'orful', w)       # colourful→colorful
            w = re.sub(r'ourless\b', 'orless', w)     # colourless→colorless
            w = re.sub(r'ourist\b', 'orist', w)       # colourist→colorist
            w = re.sub(r'our\b', 'or', w)             # colour→color
            w = re.sub(r'ours\b', 'ors', w)
            w = re.sub(r'iour\b', 'ior', w)           # behaviour→behavior, saviour→savior
            w = re.sub(r'ourit', 'orit', w)           # favourite→favorite
            w = re.sub(r'oured\b', 'ored', w)         # favoured→favored, honoured→honored
            w = re.sub(r'ouring\b', 'oring', w)       # favouring→favoring
            w = re.sub(r're\b', 'er', w)              # centre→center
            w = re.sub(r'ogue\b', 'og', w)            # catalogue→catalog
            w = w.replace('ll', 'l')                  # travelled→traveled (rough)
            return w

        return normalize(o) == normalize(c)

    # ── Merge span-head errors with T5 corrections + explanations ───────────────

    # Common irregular verb forms that learners write wrong → correct past tense.
    # Used to override the T5 / pyspellchecker correction when they produce a
    # plausible dictionary word that is NOT the correct grammatical form.
    _IRREGULAR_VERB_FIX: dict[str, str] = {
        # be
        'speaked': 'spoke', 'speaked': 'spoke',
        'getted': 'got', 'geted': 'got',
        'goed': 'went', 'wented': 'went',
        'comed': 'came', 'camed': 'came',
        'runned': 'ran', 'ranned': 'ran',
        'sitted': 'sat', 'seted': 'sat',
        'taked': 'took', 'taked': 'took',
        'gived': 'gave', 'gaved': 'gave',
        'knowed': 'knew', 'knewed': 'knew',
        'thinked': 'thought', 'thunk': 'thought',
        'buyed': 'bought', 'buied': 'bought',
        'bringed': 'brought', 'brung': 'brought',
        'catched': 'caught',
        'teached': 'taught',
        'leaved': 'left',
        'feeled': 'felt',
        'meeted': 'met',
        'sended': 'sent',
        'spended': 'spent',
        'sleeped': 'slept',
        'keeped': 'kept',
        'leaped': 'leapt',
        'swepted': 'swept', 'sweeped': 'swept',
        'readed': 'read',
        'writed': 'wrote', 'wroted': 'wrote',
        'breaked': 'broke',
        'choosed': 'chose',
        'drived': 'drove',
        'eated': 'ate',
        'falled': 'fell',
        'flied': 'flew',
        'freezed': 'froze',
        'growed': 'grew',
        'hided': 'hid',
        'holded': 'held',
        'hurted': 'hurt',
        'losted': 'lost',
        'maked': 'made',
        'payed': 'paid',
        'rided': 'rode',
        'ringed': 'rang',
        'rised': 'rose',
        'selled': 'sold',
        'shooted': 'shot',
        'shrinked': 'shrank',
        'sanged': 'sang', 'singed': 'sang',
        'sinked': 'sank',
        'slided': 'slid',
        'smelled': 'smelt',
        'speeded': 'sped',
        'spendet': 'spent',
        'standed': 'stood',
        'stealed': 'stole',
        'sticked': 'stuck',
        'stinked': 'stank',
        'striked': 'struck',
        'swimmed': 'swam',
        'swung': 'swung',
        'throwed': 'threw',
        'understanded': 'understood',
        'wakened': 'woke',
        'wored': 'wore',
        'winned': 'won',
        # superlatives
        'difficultest': 'most difficult',
        'interestingest': 'most interesting',
        'beautifulest': 'most beautiful',
        'importantest': 'most important',
        'popularest': 'most popular',
        'wonderfulest': 'most wonderful',
        'successfullest': 'most successful',
        'comfortablest': 'most comfortable',
        'expensivest': 'most expensive',
        'intelligentest': 'most intelligent',
    }

    _GRAM_WORDS = {
        'a', 'an', 'the', 'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being',
        'has', 'have', 'had', 'do', 'does', 'did', 'go', 'goes', 'went', 'gone',
        'this', 'that', 'these', 'those', 'in', 'on', 'at', 'to', 'for', 'of',
        'with', 'by', 'from', "don't", "doesn't", "didn't",
    }

    def _categorize(self, original: str, correction: str) -> str:
        """Heuristic error type when span_head doesn't cover the change."""
        o, c = original.strip(), correction.strip()
        oa = re.sub(r'[^a-z0-9]', '', o.lower())
        ca = re.sub(r'[^a-z0-9]', '', c.lower())
        if oa == ca and o.lower() != c.lower():
            return 'PUNCT'
        if (set(o.lower().split()) & self._GRAM_WORDS) or (set(c.lower().split()) & self._GRAM_WORDS):
            return 'GRAM'
        if ' ' not in o and ' ' not in c and oa and ca:
            if difflib.SequenceMatcher(None, oa, ca).ratio() >= 0.55:
                return 'SPELL'
        if len(o.split()) == len(c.split()) and o.split():
            return 'VOCAB'
        return 'GRAM'

    def _fix_irregular_verbs(self, original_text: str, corrected_text: str) -> str:
        """
        For every word in the original that matches a known wrong irregular verb
        form, ensure the corrected text uses the correct form (not T5's guess).
        Works word-by-word: only touches positions where the original had a known
        irregular error; leaves all other T5 corrections intact.
        """
        orig_words = original_text.split()
        corr_words = corrected_text.split()
        # Pad corrected to same length if T5 inserted/deleted words
        if len(corr_words) < len(orig_words):
            corr_words += orig_words[len(corr_words):]
        result = list(corr_words)
        for i, orig_word in enumerate(orig_words):
            lower = re.sub(r'[^a-z]', '', orig_word.lower())
            fix = self._IRREGULAR_VERB_FIX.get(lower)
            if fix and i < len(result):
                # Preserve capitalisation of the first letter
                result[i] = fix[0].upper() + fix[1:] if orig_word[:1].isupper() else fix
        return ' '.join(result)

    @staticmethod
    def _merge_errors(model_errors: list, llm_errors: list) -> list:
        # Merge the model's and the LLM's error lists. Both use the SAME
        # coordinate system (char offsets into the original text), so we dedupe
        # by overlapping span. LLM errors win on overlap (more complete +
        # better worded); model-only errors are appended.
        def overlaps(a, b):
            return not (a['end'] <= b['start'] or b['end'] <= a['start'])
        merged = list(llm_errors)
        for me in model_errors:
            if not any(overlaps(me, le) for le in llm_errors):
                merged.append(me)
        merged.sort(key=lambda e: e['start'])
        return merged

    def _build_error_details(self, words: list, error_spans: list, corrected: str) -> list:
        """
        Detect errors from the original↔corrected DIFF (high recall — every fix
        the corrector makes is captured), then:
          • skip British/American dialect & quote-style variants (false positives)
          • assign the error TYPE from span_head when it overlaps the change,
            otherwise fall back to a heuristic categoriser

        Diff-based detection is used because span_head alone has poor recall
        (it routinely misses obvious errors the corrector fixes).
        """
        corr_words = corrected.split()

        # span_head type map: original word index → coarse type (for typing only)
        span_type = {es['position']: es['error_type'] for es in error_spans}

        # Char offset of each original word
        offsets, pos = [], 0
        for w in words:
            offsets.append(pos)
            pos += len(w) + 1

        sm = difflib.SequenceMatcher(None, words, corr_words, autojunk=False)
        errors = []

        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == 'equal':
                continue

            orig_phrase = ' '.join(words[i1:i2]).strip()
            corr_phrase = ' '.join(corr_words[j1:j2]).strip()

            if tag == 'delete' or not corr_phrase:
                corr_phrase = '[removed]'
            if tag == 'insert' or not orig_phrase:
                orig_phrase = '[missing word]'

            # Skip pure capitalisation noise ONLY for multi-word phrases
            # (single-word case-only changes like messi→Messi are real errors)
            if orig_phrase.lower() == corr_phrase.lower() and ' ' in orig_phrase:
                continue
            # Skip British/American dialect & quote-style differences
            if corr_phrase != '[removed]' and orig_phrase != '[missing word]' \
                    and self._is_dialect_variant(orig_phrase, corr_phrase):
                continue

            # Type: prefer span_head's label if it flagged any word in this range
            etype = None
            for wi in range(i1, i2):
                if wi in span_type:
                    etype = _COARSE_NAME_TO_BIO.get(span_type[wi], 'GRAM')
                    break
            if etype is None:
                if orig_phrase == '[missing word]':
                    etype = 'GRAM'
                elif corr_phrase == '[removed]':
                    etype = 'GRAM'
                else:
                    etype = self._categorize(orig_phrase, corr_phrase)

            if orig_phrase == '[missing word]':
                explanation = f"A word is missing here — '{corr_phrase}' should be added."
            elif corr_phrase == '[removed]':
                explanation = f"'{orig_phrase}' is unnecessary here and should be removed."
            else:
                tmpl = _EXPLANATION_TEMPLATES.get(etype, "Error: '{original}' → '{correction}'.")
                explanation = tmpl.format(original=orig_phrase, correction=corr_phrase)

            start = offsets[i1] if i1 < len(offsets) else 0
            end = (offsets[i2 - 1] + len(words[i2 - 1])) if (i2 > i1 and i2 - 1 < len(offsets)) else start

            errors.append({
                'type':        etype,
                'label':       _ERROR_DISPLAY.get(etype, etype),
                'start':       start,
                'end':         end,
                'text':        orig_phrase,
                'suggestion':  corr_phrase,
                'explanation': explanation,
            })
        return errors

    # ── Public API ────────────────────────────────────────────────────────────

    def Analyze_Text(self, Text: str) -> dict:
        if not Text or not Text.strip():
            raise ValueError('Text cannot be empty')

        text  = Text.strip()
        words = text.split()
        n_words = max(len(words), 1)

        # Head 1 — BIO error span detection (the trained detector)
        error_spans = self._detect_error_spans(words)

        # Head 2 — severity + fluency
        severity, fluency = self._severity_fluency(words)

        # Head 4 — recurring patterns + trend
        recurring, user_trend = self._profile_patterns(error_spans, n_words)

        # Head 5a — MODEL correction path (DeBERTa-filtered T5 + rule fixes + spell)
        neural_corrected = self._gec_correct(text)
        neural_corrected = self._apply_gec_selectively(text, neural_corrected, error_spans)
        neural_corrected = self._fix_irregular_verbs(text, neural_corrected)
        # Rule-based fixes for patterns T5-base consistently misses:
        # contractions (dont→don't) and split compounds (every thing→everything)
        neural_corrected = self._rule_correct(neural_corrected)
        model_corrected, spelling_corrections = self._spelling_filter(neural_corrected)

        # LLM correction path (OpenRouter) — catches context typos (raw→row),
        # proper-noun capitalisation, preposition/word-choice and sentence-
        # splitting that T5-base cannot. Empty string if unavailable/offline.
        llm_corrected = ''
        try:
            from .Explanation_Generator import llm_correct_text
            llm_corrected = llm_correct_text(text)
        except Exception as exc:
            Logger.warning('LLM correction unavailable: %s', exc)
            llm_corrected = ''

        feedback_text = ''  # T5 feedback disabled — output was unreliable

        # HYBRID error breakdown: keep the model's detected errors AND merge in
        # the LLM's extra corrections. The displayed "Corrected Version" uses the
        # LLM text when available (it is the more complete superset), else model.
        model_errors = self._build_error_details(words, error_spans, model_corrected)
        if llm_corrected:
            llm_errors = self._build_error_details(words, error_spans, llm_corrected)
            errors = self._merge_errors(model_errors, llm_errors)
            corrected = llm_corrected
        else:
            errors = model_errors
            corrected = model_corrected

        # AI-generated explanations (OpenRouter). Falls back to the templates
        # already set in _build_error_details if no API key / call fails.
        try:
            from .Explanation_Generator import generate_explanations
            generate_explanations(errors, context_text=text)
        except Exception as exc:
            Logger.warning('Explanation generation skipped: %s', exc)

        # Scores derived from the FILTERED errors (consistent with what the user
        # sees), with SEVERITY WEIGHTING: a grammar mistake hurts more than a
        # missing comma. Then the overall is blended with the model's severity
        # head so the headline number is partly model-driven.
        counts = Counter(_BIO_TO_COARSE_NAME.get(e['type'], 'grammar') for e in errors)

        # Score each skill from its ERROR DENSITY (errors per 100 words) with a
        # smooth exponential decay, so the score:
        #   • is length-fair (10 errors in 500 words ≠ 10 errors in 50 words),
        #   • has diminishing returns (the 8th error hurts less than the 1st),
        #   • never collapses unfairly to 0 the way the old per-sentence formula
        #     did once the hybrid corrector started finding many more errors.
        # _SCORE_SCALE tunes overall strictness (higher = more lenient).
        _SCORE_SCALE = 12.0

        def _dim(etype):
            penalty = _TYPE_PENALTY.get(etype, 1.0)
            per_100w = counts.get(etype, 0) * 100.0 / n_words
            # 0 errors → 100.  More errors → exponentially toward 0.
            # Example (grammar, penalty 1.0): 3 err/100w ≈ 81, 7 err/100w ≈ 56.
            score = 100.0 * math.exp(-penalty * per_100w / _SCORE_SCALE)
            return round(score, 2)

        grammar_score = _dim('grammar')
        spelling_score = _dim('spelling')
        punct_score   = _dim('punctuation')
        vocab_score   = _dim('vocabulary')

        formula_overall = (
            grammar_score * 0.35 + spelling_score * 0.25
            + punct_score * 0.20 + vocab_score * 0.20
        )
        # severity: 0 = perfect, 1 = many errors → model quality = (1 - severity)
        model_quality = (1.0 - severity) * 100.0
        overall_score = round(0.75 * formula_overall + 0.25 * model_quality, 2)

        detected_issues = sorted(set(counts.keys()))

        # Derive dominant error directly from the actual error counts so it
        # always reflects the real most-frequent category in this submission.
        # The pattern head (LSTM) was not reliable for this — it defaulted to
        # 'grammar / consistent' regardless of the actual errors found.
        dominant_error = counts.most_common(1)[0][0] if counts else ''

        # Trend: the LSTM pattern head requires stable per-user history to be
        # meaningful.  For a single submission it has no meaningful signal, so
        # we always report 'consistent' here. Cross-submission trend analysis
        # belongs at the dashboard layer, not inside single-text analysis.
        error_trend = 'consistent'

        Logger.info(
            'Feedback v2: %d spans, overall=%.1f g=%.1f s=%.1f p=%.1f v=%.1f sev=%.2f flu=%.2f',
            len(error_spans), overall_score, grammar_score, spelling_score,
            punct_score, vocab_score, severity, fluency,
        )

        return {
            'text':               text,
            'corrected':          corrected,
            'feedback_text':      feedback_text,
            'overall_score':      overall_score,
            'grammar_score':      grammar_score,
            'spelling_score':     spelling_score,
            'vocab_score':        vocab_score,
            'punct_score':        punct_score,
            'severity':           severity,
            'fluency':            fluency,
            'detected_issues':    detected_issues,
            'errors':             errors,
            'spelling_corrections': spelling_corrections,
            'recurring_patterns': recurring,
            'dominant_error':     dominant_error,
            'error_trend':        error_trend,
            'correction_applied': corrected.strip().lower() != text.strip().lower(),
        }

    def Analyze_Batch(self, Texts: list) -> list:
        results = []
        for t in Texts:
            try:
                results.append(self.Analyze_Text(t))
            except Exception as exc:
                Logger.error('Batch item failed: %s', exc)
                results.append({'error': str(exc), 'text': (t or '')[:100]})
        return results

    def Get_Model_Info(self) -> dict:
        return {
            'model':        'multi_head_feedback_v2',
            'encoder':      'DeBERTa-v3-base',
            'correction':   'Flan-T5-base',
            'error_labels': list(_ERROR_DISPLAY.values()),
            'device':       str(self.device),
            'model_loaded': True,
        }


# ── Singleton ─────────────────────────────────────────────────────────────────

_Feedback_Analyzer_Instance = None


def Get_Feedback_Analyzer():
    global _Feedback_Analyzer_Instance
    if _Feedback_Analyzer_Instance is None:
        _Feedback_Analyzer_Instance = Feedback_Analyzer()
    return _Feedback_Analyzer_Instance
