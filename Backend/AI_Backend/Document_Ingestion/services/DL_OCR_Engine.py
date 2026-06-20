"""
CRNN-based OCR engine for scanned PDF pages.

Architecture: CNN[64-128-256-256-512] + BiLSTM256 + CTC
Input:  PIL Image (one text line, any size — resized to H=32, W=200)
Output: predicted string

Usage:
    engine = get_dl_ocr_engine()          # singleton, loaded once
    text   = engine.extract_page(image)   # full page image → string
"""

import logging
from pathlib import Path

Logger = logging.getLogger(__name__)

# ── model weights ──────────────────────────────────────────────────────────────
_WEIGHTS = (
    Path(__file__).resolve().parents[4]   # repo root
    / "Models_Weights" / "PDF_Extraction" / "Extraction_Model.pt"
)

# ── CRNN architecture (must match training) ────────────────────────────────────
try:
    import torch
    import torch.nn as nn

    class _CRNN(nn.Module):
        def __init__(self, num_classes: int, img_h: int = 32):
            super().__init__()
            # Architecture reverse-engineered from checkpoint layer indices:
            # 0:Conv 1:ReLU 2:Pool | 3:Conv 4:ReLU 5:Pool |
            # 6:Conv 7:BN 8:ReLU 9:Conv 10:ReLU 11:Pool((2,1)) |
            # 12:Conv 13:BN 14:ReLU 15:Pool((2,1)) |
            # 16:Conv 17:ReLU 18:Pool((2,1))
            self.cnn = nn.Sequential(
                nn.Conv2d(1, 64,  3, padding=1),    # 0
                nn.ReLU(inplace=True),               # 1
                nn.MaxPool2d(2, 2),                  # 2
                nn.Conv2d(64, 128, 3, padding=1),    # 3
                nn.ReLU(inplace=True),               # 4
                nn.MaxPool2d(2, 2),                  # 5
                nn.Conv2d(128, 256, 3, padding=1),   # 6
                nn.BatchNorm2d(256),                 # 7
                nn.ReLU(inplace=True),               # 8
                nn.Conv2d(256, 256, 3, padding=1),   # 9
                nn.ReLU(inplace=True),               # 10
                nn.MaxPool2d((2, 1)),                # 11
                nn.Conv2d(256, 512, 3, padding=1),   # 12
                nn.BatchNorm2d(512),                 # 13
                nn.ReLU(inplace=True),               # 14
                nn.MaxPool2d((2, 1)),                # 15
                nn.Conv2d(512, 512, 2, padding=1),   # 16
                nn.ReLU(inplace=True),               # 17
                nn.MaxPool2d((2, 1)),                # 18
            )
            self.rnn = nn.LSTM(512, 256, bidirectional=True, batch_first=True)
            self.fc  = nn.Linear(512, num_classes)

        def forward(self, x):           # x: (B, 1, H, W)
            x = self.cnn(x)             # (B, 512, 1, W')
            x = x.squeeze(2)            # (B, 512, W')
            x = x.permute(0, 2, 1)     # (B, W', 512)
            x, _ = self.rnn(x)          # (B, W', 512)
            return self.fc(x)           # (B, W', num_classes)

    _torch_available = True
except ImportError:
    _torch_available = False
    Logger.warning("PyTorch not available — DL OCR engine disabled")

# ── Singleton ──────────────────────────────────────────────────────────────────
_ENGINE_INSTANCE = None


def is_available() -> bool:
    return _torch_available and _WEIGHTS.exists()


def get_dl_ocr_engine():
    global _ENGINE_INSTANCE
    if _ENGINE_INSTANCE is None:
        _ENGINE_INSTANCE = _DL_OCR_Engine()
    return _ENGINE_INSTANCE


# ── Engine class ───────────────────────────────────────────────────────────────
class _DL_OCR_Engine:
    def __init__(self):
        if not is_available():
            raise RuntimeError("DL OCR engine unavailable — PyTorch or weights missing")

        ckpt = torch.load(str(_WEIGHTS), map_location="cpu", weights_only=False)
        self.chars    = ckpt["chars"]            # e.g. " abcdefghijklm..."
        self.img_h    = ckpt.get("img_h", 32)
        self.img_w    = ckpt.get("img_w", 200)
        num_classes   = ckpt["num_classes"]      # includes CTC blank

        self.model = _CRNN(num_classes=num_classes, img_h=self.img_h)
        self.model.load_state_dict(ckpt["state_dict"])
        self.model.eval()
        Logger.info("DL OCR engine loaded — arch: %s, CER: %.3f",
                    ckpt.get("arch", "CRNN"), ckpt.get("test_CER", 0))

    # ── public API ─────────────────────────────────────────────────────────────
    def extract_page(self, image, min_line_height: int = 8) -> dict:
        """
        Extract text from a full-page PIL Image.

        1. Convert to grayscale
        2. Segment into text lines (horizontal projection profile)
        3. Run CRNN on each line strip
        4. Join lines into page text

        Returns the same dict shape as OCR_Engine.extract_text_from_image().
        """
        try:
            from PIL import Image as PILImage
            import numpy as np

            gray = image.convert("L")
            lines = self._segment_lines(gray, min_line_height)
            if not lines:
                return {"text": "", "confidence": 0.0, "tool": "crnn_dl"}

            texts, confs = [], []
            for line_img in lines:
                t, c = self._decode_line(line_img)
                if t.strip():
                    texts.append(t.strip())
                    confs.append(c)

            avg_conf = round(sum(confs) / len(confs) * 100, 2) if confs else 0.0
            return {
                "text": "\n".join(texts),
                "confidence": avg_conf,
                "tool": "crnn_dl",
            }
        except Exception as exc:
            Logger.warning("DL OCR page extraction failed: %s", exc)
            return {"text": "", "confidence": 0.0, "tool": "crnn_dl"}

    # ── private helpers ────────────────────────────────────────────────────────
    def _segment_lines(self, gray_image, min_height: int = 8):
        """Horizontal projection profile line segmentation."""
        import numpy as np
        from PIL import Image as PILImage

        arr = np.array(gray_image)
        # Binarize (Otsu-like threshold)
        threshold = arr.mean()
        binary = (arr < threshold).astype(np.uint8)   # 1 = dark pixel (text)

        row_sums = binary.sum(axis=1)                  # ink per row
        in_line  = False
        start    = 0
        strips   = []

        for row_idx, ink in enumerate(row_sums):
            if not in_line and ink > 0:
                in_line, start = True, row_idx
            elif in_line and ink == 0:
                in_line = False
                height = row_idx - start
                if height >= min_height:
                    crop = gray_image.crop((0, start, gray_image.width, row_idx))
                    strips.append(crop)

        # last line if page ends while in a line
        if in_line and (gray_image.height - start) >= min_height:
            strips.append(gray_image.crop((0, start, gray_image.width, gray_image.height)))

        return strips

    def _decode_line(self, line_img):
        """Run CRNN on a single-line PIL Image and return (text, raw_score)."""
        import numpy as np
        from PIL import Image as PILImage

        # Resize to model input size
        resized = line_img.resize((self.img_w, self.img_h), PILImage.LANCZOS)
        arr = np.array(resized, dtype=np.float32) / 255.0
        arr = (arr - 0.5) / 0.5                        # normalize to [-1, 1]
        tensor = torch.from_numpy(arr).unsqueeze(0).unsqueeze(0)  # (1,1,H,W)

        with torch.no_grad():
            logits = self.model(tensor)                 # (1, T, num_classes)
            probs  = torch.softmax(logits, dim=-1)
            indices = logits.argmax(dim=-1).squeeze(0)  # (T,)

        # CTC greedy decode using the model's char vocabulary
        text = self._ctc_greedy(indices.tolist(), self.chars)

        # Confidence = mean max-prob across non-blank frames
        conf = float(probs.squeeze(0).max(dim=-1).values.mean())
        return text, conf

    @staticmethod
    def _ctc_greedy(indices: list, chars: str) -> str:
        """CTC greedy decode: collapse repeats, strip blank (index 0), map via chars vocab."""
        result = []
        prev   = None
        for idx in indices:
            if idx != prev:
                if idx != 0 and 1 <= idx <= len(chars):
                    result.append(chars[idx - 1])
                prev = idx
        return "".join(result)
