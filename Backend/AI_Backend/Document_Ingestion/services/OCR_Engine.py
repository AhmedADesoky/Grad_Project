import logging

Logger = logging.getLogger(__name__)

try:
	import pytesseract
	from pytesseract import Output
	from PIL import Image
except Exception:  # pragma: no cover - optional dependency fallback
	pytesseract = None
	Output = None
	Image = None


def is_available():
	return pytesseract is not None and Image is not None


def _safe_float(value):
	try:
		return float(value)
	except Exception:
		return 0.0


def extract_text_from_image(image):
	if not is_available():
		raise RuntimeError(
			'OCR is unavailable. Install pytesseract and Pillow, and make sure Tesseract OCR is installed on the system.'
		)

	text = pytesseract.image_to_string(image, config='--psm 6') or ''

	confidence = 0.0
	try:
		data = pytesseract.image_to_data(image, output_type=Output.DICT, config='--psm 6')
		confidences = [_safe_float(conf) for conf in data.get('conf', []) if _safe_float(conf) >= 0]
		if confidences:
			confidence = sum(confidences) / len(confidences)
	except Exception as exc:
		Logger.debug('OCR confidence calculation failed: %s', exc)

	return {
		'text': text.strip(),
		'confidence': round(confidence, 2),
		'tool': 'pytesseract',
	}
