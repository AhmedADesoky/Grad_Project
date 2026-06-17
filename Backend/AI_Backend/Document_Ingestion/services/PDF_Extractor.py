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


def _page_word_count(text):
	return len([token for token in str(text or '').split() if token])


def _pixmap_to_image(pixmap):
	from PIL import Image

	return Image.frombytes('RGB', [pixmap.width, pixmap.height], pixmap.samples)


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

			if use_ocr and len(direct_text) < min_text_length and ocr_is_available():
				try:
					pixmap = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
					image_result = extract_text_from_image(_pixmap_to_image(pixmap))
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

				if use_ocr and len(direct_text) < min_text_length and ocr_is_available():
					try:
						image = page.to_image(resolution=200).original
						image_result = extract_text_from_image(image)
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
		extraction_tool = 'hybrid_pdf_ocr'
	elif fitz is not None:
		extraction_tool = 'pdf_text_extraction'
	else:
		extraction_tool = 'pdfplumber_text_extraction'

	return {
		'page_count': total_pages,
		'page_results': page_results,
		'extraction_tool': extraction_tool,
	}
