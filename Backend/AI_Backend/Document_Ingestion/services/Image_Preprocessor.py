"""
Image preprocessing pipeline for scanned PDF pages before OCR.

Handles CamScanner / phone-camera images: beige backgrounds, uneven
lighting, shadow from book spine, low-contrast pencil handwriting.
"""

import logging

Logger = logging.getLogger(__name__)


def preprocess_for_ocr(pil_image):
    """
    Return a cleaned, high-contrast grayscale image ready for any OCR engine.
    Steps: shadow removal → grayscale → contrast stretch → sharpen → binarise
    """
    try:
        from PIL import Image, ImageEnhance, ImageFilter, ImageOps
        import numpy as np

        img = pil_image.convert('RGB')
        w, h = img.size

        # ── 1. Remove dark border shadows (book spine / corner fold) ──────────
        # Replace near-black border pixels with the median background colour
        # so they don't confuse the contrast stretch step.
        arr = np.array(img, dtype=np.float32)
        BORDER = max(5, int(min(w, h) * 0.02))  # 2% of shorter edge
        bg_sample = np.concatenate([
            arr[:BORDER, :].reshape(-1, 3),
            arr[-BORDER:, :].reshape(-1, 3),
            arr[:, :BORDER].reshape(-1, 3),
            arr[:, -BORDER:].reshape(-1, 3),
        ])
        bg_color = np.median(bg_sample, axis=0)  # e.g. [230, 225, 215] for beige

        gray_arr = arr.mean(axis=2)
        shadow_mask = gray_arr < 60  # near-black = shadow artifact
        for c in range(3):
            arr[:, :, c] = np.where(shadow_mask, bg_color[c], arr[:, :, c])

        img = Image.fromarray(arr.clip(0, 255).astype(np.uint8))

        # ── 2. Convert to grayscale ────────────────────────────────────────────
        gray = img.convert('L')

        # ── 3. Auto-contrast stretch ──────────────────────────────────────────
        # Stretches the darkest ink to 0 and the lightest background to 255.
        # Handles beige paper (bg ~220) and light pencil (~130) equally well.
        gray = ImageOps.autocontrast(gray, cutoff=2)

        # ── 4. Sharpen to make stroke edges crisper ───────────────────────────
        gray = gray.filter(ImageFilter.SHARPEN)
        gray = gray.filter(ImageFilter.SHARPEN)

        # ── 5. Adaptive binarisation (Otsu-like via numpy) ────────────────────
        g = np.array(gray, dtype=np.float32)
        # Compute local threshold in 32x32 tiles for uneven lighting
        TILE = 64
        out = np.ones_like(g) * 255.0
        for ty in range(0, h, TILE):
            for tx in range(0, w, TILE):
                tile = g[ty:ty+TILE, tx:tx+TILE]
                if tile.size == 0:
                    continue
                t_min, t_max = tile.min(), tile.max()
                if t_max - t_min < 20:
                    # Essentially blank tile — keep white
                    continue
                thresh = t_min + (t_max - t_min) * 0.55
                out[ty:ty+TILE, tx:tx+TILE] = np.where(tile < thresh, 0.0, 255.0)

        result = Image.fromarray(out.astype(np.uint8)).convert('RGB')
        Logger.info('Image preprocessed: %dx%d → ready for OCR', w, h)
        return result

    except Exception as exc:
        Logger.warning('Image preprocessing failed (%s) — using original', exc)
        return pil_image
