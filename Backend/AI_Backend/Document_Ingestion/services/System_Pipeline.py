import base64
import logging
import uuid
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlretrieve

from Classification.services.DistilBERT_Classifier import Get_Classifier
from Feedback.services.Feedback_Model import Get_Feedback_Analyzer

from ..models import Document_Analysis
from .PDF_Extractor import extract_pdf_pages
from .Text_Cleaner import clean_extracted_text, merge_page_texts
from .Cloudinary_Storage import upload_pdf


Logger = logging.getLogger(__name__)


BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = BASE_DIR / 'data' / 'document_uploads'
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _safe_name(file_name):
	file_name = (file_name or '').strip()
	if not file_name:
		return f'document_{uuid.uuid4().hex}.pdf'
	if not file_name.lower().endswith('.pdf'):
		file_name = f'{file_name}.pdf'
	return file_name.replace('..', '_').replace('/', '_').replace('\\', '_')


def _decode_base64_pdf(pdf_base64, file_name):
	if not pdf_base64:
		return None

	payload = pdf_base64.strip()
	if ',' in payload and payload.lower().startswith('data:'):
		payload = payload.split(',', 1)[1]

	binary = base64.b64decode(payload)
	safe_name = _safe_name(file_name)
	target_path = UPLOAD_DIR / f'{uuid.uuid4().hex}_{safe_name}'
	with open(target_path, 'wb') as pdf_file:
		pdf_file.write(binary)
	return target_path


def _download_pdf(pdf_url, file_name):
	if not pdf_url:
		return None

	parsed = urlparse(pdf_url)
	if parsed.scheme in ('http', 'https'):
		target_path = UPLOAD_DIR / f'{uuid.uuid4().hex}_{_safe_name(file_name)}'
		urlretrieve(pdf_url, target_path)
		return target_path

	candidate = Path(pdf_url)
	return candidate if candidate.exists() else None


def serialize_document_analysis(record):
	if record is None:
		return None

	return {
		'analysis_id': record.Analysis_Id,
		'user_id': record.User_Id,
		'pdf_url': record.Pdf_Url,
		'pdf_storage_path': record.Pdf_Storage_Path,
		'file_name': record.File_Name,
		'page_count': record.Page_Count,
		'extraction_tool': record.Extraction_Tool,
		'page_results': record.Page_Results,
		'clean_text': record.Clean_Text,
		'classification': {
			'level': record.Classification_Level,
			'confidence': record.Classification_Confidence,
			'description': record.Classification_Description,
			'probabilities': record.Classification_Probabilities,
		},
		'feedback': {
			'corrected_text': record.Feedback_Corrected_Text,
			'overall_score': record.Feedback_Overall_Score,
			'grammar_score': record.Feedback_Grammar_Score,
			'vocab_score': record.Feedback_Vocab_Score,
			'punct_score': record.Feedback_Punct_Score,
			'detected_issues': record.Feedback_Detected_Issues,
			'errors': record.Feedback_Errors,
			'error_trend': record.Feedback_Error_Trend,
			'dominant_error': record.Feedback_Dominant_Error,
			'severity': record.Feedback_Severity,
			'fluency': record.Feedback_Fluency,
			'feedback_text': record.Feedback_Text,
		},
		'status': record.Status,
		'error_message': record.Error_Message,
		'created_at': str(record.Created_At) if record.Created_At else None,
		'updated_at': str(record.Updated_At) if record.Updated_At else None,
	}


def analyze_document_file(
	pdf_path=None,
	pdf_base64=None,
	pdf_url='',
	user_id='',
	file_name='',
	save_to_database=True,
	use_ocr=True,
):
	temp_path = None  # track temp files so we can delete them after processing
	try:
		source_path = None
		source_name = file_name or (Path(pdf_path).name if pdf_path else '')
		is_temp = False  # True when we created the file and should delete it

		if pdf_base64:
			source_path = _decode_base64_pdf(pdf_base64, source_name)
			is_temp = True
		elif pdf_url:
			source_path = _download_pdf(pdf_url, source_name)
			is_temp = True
		elif pdf_path:
			source_path = Path(pdf_path)

		if source_path is None:
			return {'success': False, 'error': 'No PDF input was provided'}

		if is_temp:
			temp_path = source_path

		# ── Upload to Cloudinary for permanent storage ──────────────────────
		cloudinary_url = upload_pdf(source_path, source_name or Path(source_path).name)
		# Fall back to Cloudinary URL as pdf_url if upload succeeded
		storage_path = cloudinary_url or str(source_path)
		effective_pdf_url = cloudinary_url or pdf_url or ''

		# ── Extract text (OCR for scanned, direct for digital) ──────────────
		extraction = extract_pdf_pages(source_path, use_ocr=use_ocr)
		page_results = extraction['page_results']
		clean_text = clean_extracted_text(merge_page_texts(page_results))

		if not clean_text:
			return {
				'success': False,
				'error': 'The PDF did not produce any usable text after extraction and OCR',
			}

		classifier = Get_Classifier()
		classification = classifier.Classify_Text(Text=clean_text, Return_Probabilities=True)

		analyzer = Get_Feedback_Analyzer()
		feedback = analyzer.Analyze_Text(Text=clean_text)

		# Apply the same language_score formula used in the exam pipeline so
		# scores are consistent across both surfaces.
		_raw_overall = float(feedback.get('overall_score', 0.0) or 0.0)
		_grammar_s   = float(feedback.get('grammar_score', 0.0) or 0.0)
		_vocab_s     = float(feedback.get('vocab_score',   0.0) or 0.0)
		_punct_s     = float(feedback.get('punct_score',   0.0) or 0.0)
		feedback['overall_score'] = round(
			min(100.0, max(0.0, 0.70 * _raw_overall + 0.10 * _grammar_s + 0.10 * _vocab_s + 0.10 * _punct_s)),
			2,
		)

		saved_record = None
		if save_to_database:
			saved_record = Document_Analysis.objects.create(
				User_Id=user_id or '',
				Pdf_Url=effective_pdf_url,
				Pdf_Storage_Path=storage_path,
				File_Name=source_name or Path(source_path).name,
				Page_Count=extraction['page_count'],
				Extraction_Tool=extraction['extraction_tool'],
				Page_Results=page_results,
				Clean_Text=clean_text,
				Classification_Level=classification.get('level', ''),
				Classification_Confidence=float(classification.get('confidence', 0.0) or 0.0),
				Classification_Description=classification.get('description', ''),
				Classification_Probabilities=classification.get('probabilities', {}),
				Feedback_Corrected_Text=feedback.get('corrected', ''),
				Feedback_Overall_Score=float(feedback.get('overall_score', 0.0) or 0.0),
				Feedback_Grammar_Score=float(feedback.get('grammar_score', 0.0) or 0.0),
				Feedback_Vocab_Score=float(feedback.get('vocab_score', 0.0) or 0.0),
				Feedback_Punct_Score=float(feedback.get('punct_score', 0.0) or 0.0),
				Feedback_Detected_Issues=feedback.get('detected_issues', []),
				Feedback_Errors=feedback.get('errors', []),
				Feedback_Error_Trend=feedback.get('error_trend', ''),
				Feedback_Dominant_Error=feedback.get('dominant_error', ''),
				Feedback_Severity=float(feedback.get('severity', 0.0) or 0.0),
				Feedback_Fluency=float(feedback.get('fluency', 0.0) or 0.0),
				Feedback_Text=feedback.get('feedback_text', ''),
				Status='COMPLETED',
				Error_Message='',
			)

		document_payload = serialize_document_analysis(saved_record) if saved_record else {
			'analysis_id': None,
			'user_id': user_id or '',
			'pdf_url': effective_pdf_url,
			'pdf_storage_path': storage_path,
			'file_name': source_name or Path(source_path).name,
			'page_count': extraction['page_count'],
			'extraction_tool': extraction['extraction_tool'],
			'page_results': page_results,
			'clean_text': clean_text,
			'classification': {
				'level': classification.get('level', ''),
				'confidence': classification.get('confidence', 0.0),
				'description': classification.get('description', ''),
				'probabilities': classification.get('probabilities', {}),
			},
			'feedback': {
				'corrected_text': feedback.get('corrected', ''),
				'overall_score': feedback.get('overall_score', 0.0),
				'grammar_score': feedback.get('grammar_score', 0.0),
				'vocab_score': feedback.get('vocab_score', 0.0),
				'punct_score': feedback.get('punct_score', 0.0),
				'detected_issues': feedback.get('detected_issues', []),
				'errors': feedback.get('errors', []),
				'error_trend': feedback.get('error_trend', ''),
				'dominant_error': feedback.get('dominant_error', ''),
				'severity': feedback.get('severity', 0.0),
				'fluency': feedback.get('fluency', 0.0),
				'feedback_text': feedback.get('feedback_text', ''),
			},
			'status': 'COMPLETED',
			'error_message': '',
			'created_at': None,
			'updated_at': None,
		}

		return {'success': True, 'document': document_payload}
	except Exception as exc:
		Logger.exception('Document analysis failed')
		return {'success': False, 'error': str(exc)}
	finally:
		# Delete the temp file now that Cloudinary has a permanent copy
		if temp_path and temp_path.exists():
			try:
				temp_path.unlink()
			except Exception:
				pass
