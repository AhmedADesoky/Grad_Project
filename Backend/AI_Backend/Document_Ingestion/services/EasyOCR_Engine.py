"""
EasyOCR-based OCR engine for scanned PDF pages.

Handles phone-camera scans (CamScanner), beige backgrounds, shadows,
and varying handwriting styles without any external binary dependency.
"""

import logging

Logger = logging.getLogger(__name__)

_easyocr_available = False
try:
    import easyocr as _easyocr_lib
    _easyocr_available = True
except ImportError:
    Logger.warning('easyocr not installed — EasyOCR engine disabled')

_ENGINE_INSTANCE = None


def is_available() -> bool:
    return _easyocr_available


def get_easyocr_engine():
    global _ENGINE_INSTANCE
    if _ENGINE_INSTANCE is None:
        _ENGINE_INSTANCE = _EasyOCR_Engine()
    return _ENGINE_INSTANCE


class _EasyOCR_Engine:
    def __init__(self):
        if not is_available():
            raise RuntimeError('EasyOCR not installed — run: pip install easyocr')
        Logger.info('Loading EasyOCR model (english) …')
        # gpu=False ensures it works on CPU-only machines
        self._reader = _easyocr_lib.Reader(['en'], gpu=False, verbose=False)
        Logger.info('EasyOCR engine ready')

    def extract_page(self, image) -> dict:
        try:
            import numpy as np
            arr = np.array(image.convert('RGB'))

            # detail=1 → returns bounding box + text + confidence per word
            results = self._reader.readtext(arr, detail=1, paragraph=False)

            if not results:
                return {'text': '', 'confidence': 0.0, 'tool': 'easyocr'}

            # Sort top-to-bottom so lines appear in reading order
            results.sort(key=lambda r: r[0][0][1])  # sort by top-left y

            lines, confs = [], []
            for (_, text, conf) in results:
                text = text.strip()
                if text and conf >= 0.3:
                    lines.append(text)
                    confs.append(conf)

            full_text = ' '.join(lines)
            avg_conf  = round(sum(confs) / len(confs) * 100, 2) if confs else 0.0

            Logger.info('EasyOCR: %d words, avg_conf=%.1f%%', len(full_text.split()), avg_conf)
            return {'text': full_text, 'confidence': avg_conf, 'tool': 'easyocr'}

        except Exception as exc:
            Logger.warning('EasyOCR extraction failed: %s', exc, exc_info=True)
            return {'text': '', 'confidence': 0.0, 'tool': 'easyocr'}
