import logging
from pathlib import Path

Logger = logging.getLogger(__name__)

try:
	import fitz  # PyMuPDF
except Exception:  # pragma: no cover - optional dependency fallback
	fitz = None

try:
	import pdfplumber
except Exception:  # pragma: no cover - optional dependency fallback
	pdfplumber = None

from .OCR_Engine import extract_text_from_image, is_available as ocr_is_available
from .DL_OCR_Engine import get_dl_ocr_engine, is_available as dl_ocr_is_available
from .TrOCR_Engine import get_trocr_engine, is_available as trocr_is_available
from .EasyOCR_Engine import get_easyocr_engine, is_available as easyocr_is_available
from .Image_Preprocessor import preprocess_for_ocr


def _page_word_count(text):
	return len([token for token in str(text or '').split() if token])


def _pixmap_to_image(pixmap):
	from PIL import Image

	return Image.frombytes('RGB', [pixmap.width, pixmap.height], pixmap.samples)


def _any_ocr_available():
	return trocr_is_available() or dl_ocr_is_available() or easyocr_is_available() or ocr_is_available()


def _run_ocr(image):
	"""
	Run OCR on a scanned page image.
	Priority: TrOCR → CRNN → EasyOCR → Tesseract.
	Each engine falls through to the next if it returns fewer than 5 words.
	EasyOCR handles CamScanner / phone-camera scans that TrOCR cannot read.
	The best-effort TrOCR result is kept as a last resort.
	"""
	best_effort = None

	if trocr_is_available():
		try:
			result = get_trocr_engine().extract_page(image, debug=False)
			word_count = len(result['text'].split())
			if word_count >= 5:
				return result
			if result['text'].strip():
				best_effort = result
			Logger.warning('TrOCR: only %d words — trying next engine', word_count)
		except Exception as exc:
			Logger.warning('TrOCR failed: %s', exc)

	if dl_ocr_is_available():
		try:
			result = get_dl_ocr_engine().extract_page(image)
			if len(result['text'].split()) >= 5:
				return result
			Logger.warning('CRNN: too few words — trying EasyOCR')
		except Exception as exc:
			Logger.warning('CRNN failed: %s', exc)

	if easyocr_is_available():
		try:
			result = get_easyocr_engine().extract_page(image)
			if result['text'].strip():
				return result
			Logger.warning('EasyOCR: returned empty text')
		except Exception as exc:
			Logger.warning('EasyOCR failed: %s', exc)

	if ocr_is_available():
		try:
			result = extract_text_from_image(image)
			if result['text'].strip():
				return result
			Logger.warning('Tesseract: returned empty text')
		except Exception as exc:
			Logger.warning('Tesseract failed: %s', exc)

	if best_effort:
		Logger.warning('All engines failed; using best-effort TrOCR (%d words)', len(best_effort['text'].split()))
		return best_effort

	raise RuntimeError('No OCR engine could extract text from this image.')


def extract_pdf_pages(pdf_path, use_ocr=True, min_text_length=20):
	pdf_path = Path(pdf_path)
	if not pdf_path.exists():
		raise FileNotFoundError(f'PDF file not found: {pdf_path}')

	page_results = []
	total_pages = 0
	used_ocr = False

	if fitz is not None:
		doc = fitz.open(pdf_path)
		total_pages = len(doc)
		for index in range(total_pages):
			page = doc[index]
			direct_text = (page.get_text('text') or '').strip()
			page_result = {
				'page_number': index + 1,
				'tool': 'pdf_text_extraction',
				'confidence': 100.0 if direct_text else 0.0,
				'text': direct_text,
				'word_count': _page_word_count(direct_text),
			}

			if use_ocr and len(direct_text) < min_text_length and _any_ocr_available():
				try:
					pixmap = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
					raw_image = _pixmap_to_image(pixmap)
					image_result = _run_ocr(preprocess_for_ocr(raw_image))
					if image_result['text']:
						page_result.update(
							{
								'tool': image_result['tool'],
								'text': image_result['text'],
								'confidence': image_result['confidence'],
								'word_count': _page_word_count(image_result['text']),
							}
						)
						used_ocr = True
				except Exception as exc:
					Logger.warning('OCR failed for page %s: %s', index + 1, exc)

			page_results.append(page_result)

		doc.close()
	elif pdfplumber is not None:
		with pdfplumber.open(str(pdf_path)) as doc:
			total_pages = len(doc.pages)
			for index, page in enumerate(doc.pages):
				direct_text = (page.extract_text() or '').strip()
				page_result = {
					'page_number': index + 1,
					'tool': 'pdfplumber_text_extraction',
					'confidence': 100.0 if direct_text else 0.0,
					'text': direct_text,
					'word_count': _page_word_count(direct_text),
				}

				if use_ocr and len(direct_text) < min_text_length and _any_ocr_available():
					try:
						raw_image = page.to_image(resolution=200).original
						image_result = _run_ocr(preprocess_for_ocr(raw_image))
						if image_result['text']:
							page_result.update(
								{
									'tool': image_result['tool'],
									'text': image_result['text'],
									'confidence': image_result['confidence'],
									'word_count': _page_word_count(image_result['text']),
								}
							)
							used_ocr = True
					except Exception as exc:
						Logger.warning('OCR failed for page %s: %s', index + 1, exc)

				page_results.append(page_result)
	else:
		raise RuntimeError('No PDF extraction engine is available. Install PyMuPDF or pdfplumber.')

	if used_ocr:
		extraction_tool = 'hybrid_trocr_ocr'
	elif fitz is not None:
		extraction_tool = 'pdf_text_extraction'
	else:
		extraction_tool = 'pdfplumber_text_extraction'

	return {
		'page_count': total_pages,
		'page_results': page_results,
		'extraction_tool': extraction_tool,
	}
