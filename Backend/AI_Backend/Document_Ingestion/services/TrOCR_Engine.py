"""
TrOCR-based OCR engine for scanned PDF pages.

Architecture: VisionEncoderDecoderModel (ViT encoder + TrOCR decoder)
Input:  full-page PIL Image
Output: {'text': str, 'confidence': float, 'tool': 'trocr'}

PDF scenarios handled:
  1. Digital PDF (typed)         → PyMuPDF extracts text directly, no OCR
  2. Scanned, no ruled lines     → darkness scoring finds handwriting rows
  3. Scanned, with ruled lines   → IQR-robust threshold ignores line outliers
  4. Very faint handwriting      → lowered INK_LEVEL + min-darkness guard
  5. Oversized merged strips     → recursively split and OCR sub-strips
  6. Noise/border strips         → MIN_LINE_H filters; confidence filter drops
  7. Multi-page PDFs             → each page processed independently
  8. Mixed typed+scanned pages   → PyMuPDF text used when ≥ min_text_length
"""

import logging
from pathlib import Path

Logger = logging.getLogger(__name__)

_WEIGHTS = (
    Path(__file__).resolve().parents[4]
    / "Models_Weights" / "PDF_Extraction" / "trocr_handwriting_model"
)

try:
    import torch
    _torch_available = True
except ImportError:
    _torch_available = False
    Logger.warning("PyTorch not available — TrOCR engine disabled")

try:
    from transformers import TrOCRProcessor, VisionEncoderDecoderModel
    _transformers_available = True
except ImportError:
    _transformers_available = False
    Logger.warning("Transformers not available — TrOCR engine disabled")

_ENGINE_INSTANCE = None


def is_available() -> bool:
    return _torch_available and _transformers_available and _WEIGHTS.exists()


def get_trocr_engine():
    global _ENGINE_INSTANCE
    if _ENGINE_INSTANCE is None:
        _ENGINE_INSTANCE = _TrOCR_Engine()
    return _ENGINE_INSTANCE


_DEBUG_DIR = Path(__file__).resolve().parents[4] / "debug_strips"


class _TrOCR_Engine:
    # ── Tuning constants ───────────────────────────────────────────────────────
    # Minimum raw span height (before padding) to keep as a text line.
    # At 288 DPI a typical handwritten letter body is ~15-30 px tall.
    # Set low so thin handwriting isn't filtered; the confidence filter
    # will discard noise that happens to pass this gate.
    _MIN_LINE_H = 12

    # Minimum per-token confidence to accept a decoded line.
    # TrOCR on real (even faint) handwriting typically scores 0.40–0.90.
    # Pure hallucination on noise/borders scores < 0.35.
    _MIN_CONF = 0.50

    # A strip taller than this fraction of page height is treated as a
    # multi-line merged block and split instead of skipped.
    _MAX_STRIP_FRAC = 0.12

    def __init__(self):
        if not is_available():
            raise RuntimeError(
                "TrOCR engine unavailable — PyTorch/transformers or weights missing"
            )
        Logger.info("Loading TrOCR model from %s …", _WEIGHTS)
        self.processor = TrOCRProcessor.from_pretrained(str(_WEIGHTS))
        self.model     = VisionEncoderDecoderModel.from_pretrained(str(_WEIGHTS))
        self.device    = "cuda" if torch.cuda.is_available() else "cpu"
        self.model.to(self.device).eval()
        Logger.info("TrOCR engine ready (device=%s)", self.device)

    # ── Public API ─────────────────────────────────────────────────────────────
    def extract_page(self, image, debug: bool = False) -> dict:
        try:
            rgb    = image.convert("RGB")

            # ── Pre-crop to the ink bounding box ──────────────────────────────
            # This removes blank margins (top, right, bottom) that cause TrOCR
            # to receive mostly empty space → hallucination.
            rgb = self._crop_to_ink_region(rgb)

            page_h = rgb.height
            page_w = rgb.width

            line_boxes = self._segment_lines(rgb)

            if not line_boxes:
                Logger.warning("TrOCR: no text lines detected on page")
                return {"text": "", "confidence": 0.0, "tool": "trocr"}

            Logger.info("TrOCR: detected %d candidate lines", len(line_boxes))

            if debug:
                _DEBUG_DIR.mkdir(parents=True, exist_ok=True)

            max_strip_h = int(page_h * self._MAX_STRIP_FRAC)

            page_lines, confs = [], []

            for idx, (y0, y1) in enumerate(line_boxes):
                strip_h = y1 - y0

                if strip_h > max_strip_h:
                    # ── Oversized strip: split and OCR each sub-strip ──────────
                    Logger.info(
                        "TrOCR: strip %d oversized (h=%d) — splitting into sub-strips",
                        idx, strip_h,
                    )
                    sub_lines = self._split_strip(rgb, y0, y1, max_strip_h)
                    for sy0, sy1 in sub_lines:
                        sub_strip = self._crop_strip_horizontally(rgb, 0, sy0, page_w, sy1)
                        if debug:
                            sub_strip.save(
                                str(_DEBUG_DIR / f"strip_{idx:03d}_sub_y{sy0}-{sy1}.png")
                            )
                        txt, cf = self._decode_strip(sub_strip)
                        Logger.info("TrOCR sub-strip y=%d-%d: %r (conf=%.2f)", sy0, sy1, txt, cf)
                        if txt and cf >= self._MIN_CONF:
                            page_lines.append(txt)
                            confs.append(cf)
                    continue

                strip = self._crop_strip_horizontally(rgb, 0, y0, page_w, y1)
                if debug:
                    strip.save(str(_DEBUG_DIR / f"strip_{idx:03d}_y{y0}-{y1}.png"))

                txt, cf = self._decode_strip(strip)
                Logger.info("TrOCR line %d: %r (conf=%.2f)", idx, txt, cf)

                if txt and cf >= self._MIN_CONF:
                    page_lines.append(txt)
                    confs.append(cf)
                elif txt:
                    Logger.info(
                        "TrOCR line %d discarded — conf %.2f < %.2f", idx, cf, self._MIN_CONF
                    )

            avg_conf  = round(sum(confs) / len(confs) * 100, 2) if confs else 0.0
            full_text = "\n".join(page_lines)
            Logger.info(
                "TrOCR page done: %d lines kept, %d words, avg_conf=%.1f%%",
                len(page_lines), len(full_text.split()), avg_conf,
            )
            return {"text": full_text, "confidence": avg_conf, "tool": "trocr"}

        except Exception as exc:
            Logger.warning("TrOCR page extraction failed: %s", exc, exc_info=True)
            return {"text": "", "confidence": 0.0, "tool": "trocr"}

    # ── Pre-step: Crop image to ink bounding box ──────────────────────────────
    def _crop_to_ink_region(self, rgb_image):
        """
        Remove blank margins around the text so TrOCR receives a tightly-cropped
        image rather than a page-sized image where text occupies only one corner.
        CamScanner PDFs typically have the text in the lower-left with large blank
        regions elsewhere that cause hallucination.

        Shadow exclusion: book-spine shadows and corner folds are nearly black
        (<50 after autocontrast). Real handwriting sits in the 50–200 range.
        We treat very-dark pixels as background so the fold is not included in
        the ink bounding box.
        """
        import numpy as np
        from PIL import ImageOps

        gray = ImageOps.autocontrast(rgb_image.convert("L"), cutoff=1)
        arr  = np.array(gray, dtype=np.float32)
        H, W = arr.shape

        # Ink = darker than 200 (handwriting) but NOT a shadow (>= 50)
        # Shadow/fold pixels are near-black (< 50) — treat as background
        SHADOW_LEVEL = 50
        INK_LEVEL    = 200
        ink_mask = ((arr >= SHADOW_LEVEL) & (arr < INK_LEVEL)).astype(np.uint8)

        rows_with_ink = np.where(ink_mask.any(axis=1))[0]
        cols_with_ink = np.where(ink_mask.any(axis=0))[0]

        if len(rows_with_ink) == 0 or len(cols_with_ink) == 0:
            return rgb_image  # nothing to crop — return original

        top    = max(0,   int(rows_with_ink[0])  - 20)
        bottom = min(H,   int(rows_with_ink[-1]) + 20)
        left   = max(0,   int(cols_with_ink[0])  - 20)
        right  = min(W,   int(cols_with_ink[-1]) + 20)

        # Only crop if we're actually removing a meaningful amount of blank space
        if (bottom - top) < H * 0.9 or (right - left) < W * 0.9:
            Logger.info(
                "TrOCR: pre-crop (%d,%d,%d,%d) → was (%d×%d) now (%d×%d)",
                left, top, right, bottom, W, H, right - left, bottom - top,
            )
            return rgb_image.crop((left, top, right, bottom))

        return rgb_image

    # ── Strip horizontal crop ──────────────────────────────────────────────────
    def _crop_strip_horizontally(self, rgb_image, x0, y0, x1, y1):
        """
        Crop a horizontal strip to the actual horizontal ink extent.
        Avoids feeding TrOCR a wide strip where text only occupies the left half.

        Same shadow-exclusion logic as _crop_to_ink_region — very-dark pixels
        (book-spine, folds) are not counted as ink.
        """
        import numpy as np
        from PIL import ImageOps

        strip = rgb_image.crop((x0, y0, x1, y1))
        w, h  = strip.size
        if w == 0 or h == 0:
            return strip

        gray = ImageOps.autocontrast(strip.convert("L"), cutoff=1)
        arr  = np.array(gray, dtype=np.float32)

        SHADOW_LEVEL = 50
        INK_LEVEL    = 200
        ink_mask = ((arr >= SHADOW_LEVEL) & (arr < INK_LEVEL)).astype(np.uint8)
        cols_with_ink = np.where(ink_mask.any(axis=0))[0]

        if len(cols_with_ink) == 0:
            return strip

        left  = max(0, int(cols_with_ink[0])  - 10)
        right = min(w, int(cols_with_ink[-1]) + 10)

        # Only crop horizontally if the text doesn't span the full width
        if right - left < w * 0.85:
            return strip.crop((left, 0, right, h))

        return strip

    # ── Step 1: Segment lines ──────────────────────────────────────────────────
    def _segment_lines(self, image) -> list[tuple[int, int]]:
        """
        Darkness-score horizontal projection segmentation.

        Why not adaptive binary:
          Adaptive threshold amplifies paper texture → every row looks like ink
          → the whole page merges into one giant span.

        Darkness scoring:
          score_row = Σ max(0, INK_LEVEL − pixel)
          Paper texture (pixel ~220) → score ≈ 0.
          Pen strokes (pixel ~40)    → score = 120 per pixel.

        IQR-robust threshold:
          raw std is inflated by dark ruled/printed lines.
          Using IQR × 0.7413 (Gaussian σ estimate) is immune to outliers.
        """
        import numpy as np
        from PIL import ImageOps

        gray = image.convert("L")
        gray = ImageOps.autocontrast(gray, cutoff=1)
        arr  = np.array(gray, dtype=np.float32)
        H, W = arr.shape

        INK_LEVEL    = 160
        SHADOW_LEVEL = 50
        # Replace near-black shadow/fold pixels with INK_LEVEL so they don't
        # contribute to the darkness score (they are artifacts, not text).
        arr_adj  = np.where(arr < SHADOW_LEVEL, INK_LEVEL, arr)
        row_dark = np.maximum(0, INK_LEVEL - arr_adj).sum(axis=1)

        p25 = float(np.percentile(row_dark, 25))
        p75 = float(np.percentile(row_dark, 75))
        iqr = p75 - p25

        # Robust std estimate; fall back to a minimum so blank pages don't
        # produce a zero threshold.
        std_robust = max(iqr * 0.7413, row_dark.max() * 0.01)
        ink_thresh = p25 + std_robust * 2.0
        is_text    = row_dark >= ink_thresh

        Logger.info(
            "TrOCR seg: p25=%.0f p75=%.0f std_r=%.0f thresh=%.0f text_rows=%d/%d",
            p25, p75, std_robust, ink_thresh, int(is_text.sum()), H,
        )

        # ── Raw spans ──────────────────────────────────────────────────────────
        raw_spans, in_line, start = [], False, 0
        for i, tr in enumerate(is_text):
            if not in_line and tr:
                in_line, start = True, i
            elif in_line and not tr:
                in_line = False
                raw_spans.append((start, i))
        if in_line:
            raw_spans.append((start, H))

        # ── Merge close spans (broken strokes of the same character/word) ─────
        # Keep gap_tol small — we must NOT merge adjacent text lines.
        gap_tol = max(4, int(H * 0.003))
        merged  = []
        for span in raw_spans:
            if merged and (span[0] - merged[-1][1]) <= gap_tol:
                merged[-1] = [merged[-1][0], span[1]]
            else:
                merged.append(list(span))

        # ── Filter short noise spans and add padding ───────────────────────────
        spans = []
        for y0, y1 in merged:
            if (y1 - y0) < self._MIN_LINE_H:
                continue
            pad = max(6, (y1 - y0) // 3)
            spans.append((max(0, y0 - pad), min(H, y1 + pad)))

        Logger.info("TrOCR seg: %d raw spans → %d merged → %d kept", len(raw_spans), len(merged), len(spans))
        return spans

    # ── Step 2: Split oversized strips ────────────────────────────────────────
    def _split_strip(self, rgb_image, y0, y1, max_h: int) -> list[tuple[int, int]]:
        """
        Re-run darkness-score segmentation inside an oversized strip to find
        individual lines within it.  Falls back to uniform halving if the
        inner segmentation still produces oversized pieces.
        """
        import numpy as np
        from PIL import ImageOps

        region = rgb_image.crop((0, y0, rgb_image.width, y1))
        gray   = ImageOps.autocontrast(region.convert("L"), cutoff=1)
        arr    = np.array(gray, dtype=np.float32)
        rH, W  = arr.shape

        INK_LEVEL    = 160
        SHADOW_LEVEL = 50
        arr_adj  = np.where(arr < SHADOW_LEVEL, INK_LEVEL, arr)
        row_dark = np.maximum(0, INK_LEVEL - arr_adj).sum(axis=1)

        if row_dark.max() == 0:
            return [(y0, y1)]

        p25 = float(np.percentile(row_dark, 25))
        p75 = float(np.percentile(row_dark, 75))
        iqr = p75 - p25
        std_r = max(iqr * 0.7413, row_dark.max() * 0.01)
        thresh = p25 + std_r * 2.0
        is_text = row_dark >= thresh

        raw, in_line, start = [], False, 0
        for i, tr in enumerate(is_text):
            if not in_line and tr:
                in_line, start = True, i
            elif in_line and not tr:
                in_line = False
                raw.append((start, i))
        if in_line:
            raw.append((start, rH))

        gap_tol = max(4, int(rH * 0.003))
        merged  = []
        for span in raw:
            if merged and (span[0] - merged[-1][1]) <= gap_tol:
                merged[-1] = [merged[-1][0], span[1]]
            else:
                merged.append(list(span))

        sub_spans = []
        for ry0, ry1 in merged:
            if (ry1 - ry0) < self._MIN_LINE_H:
                continue
            pad = max(4, (ry1 - ry0) // 3)
            abs_y0 = y0 + max(0, ry0 - pad)
            abs_y1 = y0 + min(rH, ry1 + pad)
            h = abs_y1 - abs_y0
            if h > max_h:
                # Still oversized — split in half
                mid = (abs_y0 + abs_y1) // 2
                sub_spans.extend([(abs_y0, mid), (mid, abs_y1)])
            else:
                sub_spans.append((abs_y0, abs_y1))

        # If inner segmentation found nothing useful, split the strip in half
        if not sub_spans:
            mid = (y0 + y1) // 2
            sub_spans = [(y0, mid), (mid, y1)]

        return sub_spans

    # ── Step 3: Decode one line strip ─────────────────────────────────────────
    def _decode_strip(self, strip_rgb) -> tuple[str, float]:
        """
        Feed one strip to TrOCR and return (text, mean_token_prob).

        The processor resizes any input to 384×384 internally — do NOT
        pre-scale or tile; that breaks character proportions and causes
        hallucination.
        """
        w, h = strip_rgb.size
        if w == 0 or h == 0:
            return "", 0.0

        pixel_values = self.processor(
            images=strip_rgb, return_tensors="pt"
        ).pixel_values.to(self.device)

        with torch.no_grad():
            outputs = self.model.generate(
                pixel_values,
                num_beams=4,
                early_stopping=True,
                no_repeat_ngram_size=4,
                repetition_penalty=1.3,
                return_dict_in_generate=True,
                output_scores=True,
            )

        generated_ids = outputs.sequences
        text = self.processor.batch_decode(generated_ids, skip_special_tokens=True)[0]

        # Clean leading punctuation/symbols caused by edge artifacts
        text = text.lstrip('#"\'.,!@*-– ').strip()

        # Real per-token confidence.
        # With beam search, outputs.scores has shape [num_beams, vocab] per step —
        # taking .max() across all beams inflates the score to ~1.0 for every strip,
        # bypassing the confidence filter. Use sequences_scores (final beam log-prob)
        # instead, converted to a per-token geometric-mean probability.
        if text:
            seq_scores = getattr(outputs, 'sequences_scores', None)
            if seq_scores is not None:
                seq_len = max(generated_ids.shape[1] - 1, 1)
                conf = float(torch.exp(seq_scores[0] / seq_len).item())
            elif outputs.scores:
                token_probs = [
                    torch.softmax(s[0:1], dim=-1).max().item()
                    for s in outputs.scores
                ]
                conf = float(sum(token_probs) / len(token_probs))
            else:
                conf = 0.0
        else:
            conf = 0.0

        return text, conf
