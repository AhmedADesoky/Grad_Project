import re


def normalize_whitespace(text):
	if not text:
		return ''
	text = re.sub(r'\r\n?', '\n', str(text))
	text = re.sub(r'[ \t]+', ' ', text)
	text = re.sub(r'\n{3,}', '\n\n', text)
	return text.strip()


def repair_hyphenation(text):
	if not text:
		return ''
	return re.sub(r'(\w)-\n(\w)', r'\1\2', text)


def clean_extracted_text(text):
	text = repair_hyphenation(text)
	text = normalize_whitespace(text)
	lines = [line.strip() for line in text.split('\n')]
	lines = [line for line in lines if line]
	return '\n'.join(lines).strip()


def merge_page_texts(page_results):
	texts = []
	for page in page_results or []:
		page_text = (page or {}).get('text', '')
		if page_text and page_text.strip():
			texts.append(page_text.strip())
	return clean_extracted_text('\n\n'.join(texts))
