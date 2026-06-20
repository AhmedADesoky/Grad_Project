"""
Chat_Engine — core logic for the EWC English learning chatbot.

Responsibilities:
  1. Detect intent from user message (explain / example / correct / quiz / summarize / general)
  2. Extract & chunk PDF text (reuses existing Document_Ingestion pipeline)
  3. Find the most relevant chunks via cosine similarity (reuses existing SentenceTransformer)
  4. Build a context-aware, intent-specific prompt
  5. Call OpenRouter LLM with full conversation history
  6. Generate a smart chat title after the first exchange
  7. Apply a feedback loop: past bad ratings adjust the system prompt
"""

import os
import re
import uuid
import json
import logging
import numpy as np
from urllib import request as urllib_request, error as urllib_error

Logger = logging.getLogger(__name__)

# ── Intent keywords ───────────────────────────────────────────────────────────
_INTENTS = {
    "correct":   ["correct", "fix", "check my", "is this right", "grammar check",
                  "improve my", "proofread", "edit my", "mistakes in"],
    "explain":   ["explain", "what does", "what is", "meaning of", "what are",
                  "what's", "describe", "tell me about", "how does"],
    "example":   ["example", "examples", "show me", "give me an", "demonstrate",
                  "illustrate", "sample", "like what"],
    "quiz":      ["quiz me", "test me", "give me a question", "ask me",
                  "practice", "exercise", "drill"],
    "summarize": ["summarize", "summary", "brief", "overview", "tldr",
                  "shorten", "main points", "key points"],
}

# ── System prompts per intent ─────────────────────────────────────────────────
_TONE_RULES = (
    "TONE & STYLE RULES (apply to every response):\n"
    "- Never open with filler words or hollow affirmations such as: "
    "\"Certainly!\", \"Of course!\", \"Sure!\", \"Absolutely!\", \"Great question!\", "
    "\"Happy to help!\", \"No problem!\". Start directly with the answer.\n"
    "- Be concise, professional, and warm — like a knowledgeable tutor, not a customer-service bot.\n"
    "- Use plain English; avoid unnecessary jargon.\n"
)

_SYSTEM = {
    "correct": (
        "You are an expert English writing tutor. The user wants their text corrected.\n"
        + _TONE_RULES +
        "Always structure your response exactly like this:\n"
        "✗ **Original:** [quote the exact text]\n"
        "✓ **Corrected:** [corrected version]\n"
        "📝 **Changes:** [list each correction with a brief reason]\n"
        "Keep explanations at {level} CEFR level. Be encouraging."
    ),
    "explain": (
        "You are an expert English writing tutor. Explain the topic clearly.\n"
        + _TONE_RULES +
        "Structure: definition → why it matters → example sentence → common mistake to avoid.\n"
        "Use {level} CEFR level vocabulary. Reference the document when relevant."
    ),
    "example": (
        "You are an expert English writing tutor. Show examples from the document.\n"
        + _TONE_RULES +
        "For each example: quote it → label the pattern → explain why it works.\n"
        "Then create one original example at {level} CEFR level."
    ),
    "quiz": (
        "You are an expert English writing tutor. Generate 3 questions based on the document.\n"
        + _TONE_RULES +
        "Mix types: comprehension, vocabulary, grammar.\n"
        "After the user answers, evaluate each answer with clear feedback.\n"
        "Keep questions at {level} CEFR level."
    ),
    "summarize": (
        "You are an expert English writing tutor. Summarize the document section.\n"
        + _TONE_RULES +
        "Format:\n"
        "🎯 **Topic:** [1 sentence]\n"
        "📌 **Key points:** [3–4 bullets]\n"
        "📚 **Vocabulary:** [3–5 key words with short definitions]\n"
        "Use {level} CEFR level English."
    ),
    "general": (
        "You are EWC — an expert AI English writing coach.\n"
        + _TONE_RULES +
        "Help the user improve their English writing skills.\n"
        "You can: correct text, explain grammar rules, give writing tasks, answer questions.\n"
        "Keep your responses clear and at {level} CEFR level.\n"
        "If the user has attached a document, reference it when relevant."
    ),
}


def detect_intent(message: str) -> str:
    """Fast keyword-based intent classifier — no model needed."""
    lower = message.lower()
    for intent, keywords in _INTENTS.items():
        if any(kw in lower for kw in keywords):
            return intent
    return "general"


# ── Document chunking ─────────────────────────────────────────────────────────
def chunk_text(text: str, words_per_chunk: int = 500) -> list[dict]:
    """
    Split clean text into overlapping ~500-word chunks.
    Each chunk gets a pre-computed embedding for semantic search.
    """
    if not text or not text.strip():
        return []

    words    = text.split()
    overlap  = 50            # word overlap between consecutive chunks
    step     = words_per_chunk - overlap
    chunks   = []

    for i, start in enumerate(range(0, len(words), step)):
        chunk_words = words[start : start + words_per_chunk]
        if not chunk_words:
            break
        chunk_text_str = " ".join(chunk_words)
        embedding      = _embed(chunk_text_str)
        chunks.append({
            "chunk_id":   f"c{i}",
            "text":       chunk_text_str,
            "word_count": len(chunk_words),
            "embedding":  embedding,
        })

    Logger.info("Chunked text into %d chunks (~%d words each)", len(chunks), words_per_chunk)
    return chunks


def _embed(text: str) -> list[float]:
    """Embed a single text using the shared SentenceTransformer."""
    try:
        from Personalized_Plan.services.Plan_Generator import _get_embed_model
        model = _get_embed_model()
        return model.encode(text, normalize_embeddings=True).tolist()
    except Exception as e:
        Logger.warning("Embedding failed: %s", e)
        return []


def find_relevant_chunks(message: str, chunks: list, top_k: int = 2) -> list[dict]:
    """Cosine similarity retrieval — returns top_k most relevant chunks."""
    if not chunks:
        return []

    msg_emb = _embed(message)
    if not msg_emb:
        return chunks[:top_k]   # fallback: first chunks

    msg_vec = np.array(msg_emb, dtype=np.float32)

    scored = []
    for chunk in chunks:
        emb = chunk.get("embedding")
        if not emb:
            scored.append((0.0, chunk))
            continue
        chunk_vec = np.array(emb, dtype=np.float32)
        # Both vectors are already L2-normalised from SentenceTransformer
        similarity = float(np.dot(msg_vec, chunk_vec))
        scored.append((similarity, chunk))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:top_k]]


# ── OpenRouter chat call ──────────────────────────────────────────────────────
def _get_keys():
    keys = []
    for suffix in ("", "_2", "_3", "_4", "_5", "_6", "_7", "_8"):
        k = os.getenv(f"OPENROUTER_API_KEY{suffix}", "").strip()
        if k:
            keys.append(k)
    return keys


def _call_llm(messages: list[dict]) -> str:
    """
    Call OpenRouter with a messages array. Mirrors Plan_Adjuster's _call_openrouter:
    tries free model first, then paid fallbacks, rotating all configured keys.
    Skips 402 keys for paid models so one exhausted key doesn't block the others.
    """
    base_url  = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    referer   = os.getenv("OPENROUTER_HTTP_REFERER", "http://localhost:8000")
    app_name  = os.getenv("OPENROUTER_APP_NAME", "EWC-AI-Backend")
    api_keys  = _get_keys()

    if not api_keys:
        raise ValueError("No OPENROUTER_API_KEY configured")

    paid_model = os.getenv("OPENROUTER_MODEL",      "openai/gpt-4.1-nano")
    free_model = os.getenv("OPENROUTER_FREE_MODEL", "openai/gpt-oss-120b:free")

    _builtin_fallbacks = [
        "openai/gpt-4o-mini",
        "openai/gpt-oss-120b:free",
        "google/gemini-2.5-flash",
        "nvidia/nemotron-3-super-120b-a12b:free",
    ]
    # Build deduplicated model list: paid first, then free, then built-in fallbacks
    seen, models_to_try = set(), []
    for m in [paid_model, free_model] + _builtin_fallbacks:
        if m and m not in seen:
            seen.add(m)
            models_to_try.append(m)

    dead_keys = set()  # keys that returned 402 — skip for paid models
    last_err  = None

    for mdl in models_to_try:
        is_free = mdl.endswith(":free")
        for key in api_keys:
            if not is_free and key in dead_keys:
                continue
            try:
                body = json.dumps({
                    "model":    mdl,
                    "messages": messages,
                    "max_tokens": 1024,
                }).encode("utf-8")
                req = urllib_request.Request(
                    f"{base_url}/chat/completions",
                    data=body,
                    headers={
                        "Authorization": f"Bearer {key}",
                        "Content-Type":  "application/json",
                        "HTTP-Referer":  referer,
                        "X-Title":       app_name,
                    },
                    method="POST",
                )
                with urllib_request.urlopen(req, timeout=60) as resp:
                    result = json.loads(resp.read().decode("utf-8"))
                    content = result["choices"][0]["message"]["content"].strip()
                    Logger.info("Chat LLM succeeded with model: %s", mdl)
                    return content
            except urllib_error.HTTPError as e:
                Logger.warning("Chat LLM failed (model=%s): %s", mdl, e)
                last_err = e
                if e.code in (402, 429):
                    dead_keys.add(key)
                if e.code in (400, 404):
                    break  # bad model — skip remaining keys for this model
            except Exception as e:
                Logger.warning("Chat LLM failed (model=%s): %s", mdl, e)
                last_err = e

    raise RuntimeError(f"All LLM attempts failed: {last_err}")


# ── Feedback loop ─────────────────────────────────────────────────────────────
def get_feedback_context(user_id: str) -> str:
    """
    Read the user's last 5 'bad' rated messages and build a prompt note.
    This nudges the LLM to avoid patterns the user disliked.
    """
    try:
        from Chatbot.models import ChatMessage
        bad = (
            ChatMessage.objects
            .filter(User_Id=user_id, Role='assistant', Rating='bad')
            .exclude(Rating_Comment='')
            .order_by('-Timestamp')[:5]
        )
        comments = [m.Rating_Comment for m in bad if m.Rating_Comment.strip()]
        if not comments:
            return ""
        joined = "; ".join(comments[:5])
        return f"\n[FEEDBACK] This user previously found responses unhelpful when they were: {joined}. Adjust accordingly.\n"
    except Exception:
        return ""


# ── Title generation ──────────────────────────────────────────────────────────
def generate_title(first_user_message: str, first_ai_response: str) -> str:
    """
    Generate a 4–5 word chat title using the LLM after the first exchange.
    Falls back to a truncated version of the user message if LLM fails.
    """
    fallback = " ".join(first_user_message.strip().split()[:6])
    if len(first_user_message.strip().split()) > 6:
        fallback += "…"

    try:
        prompt = (
            f"Generate a chat title in exactly 4–5 words.\n"
            f"User asked: {first_user_message[:150]}\n"
            f"Assistant answered about: {first_ai_response[:100]}\n"
            f"Reply with ONLY the title — no punctuation at the end, no quotes, no explanation."
        )
        title = _call_llm([{"role": "user", "content": prompt}])
        # Sanitise: strip quotes, limit length
        title = re.sub(r'^["\']|["\']$', '', title.strip())
        title = title[:120]
        return title if title else fallback
    except Exception as e:
        Logger.warning("Title generation failed: %s", e)
        return fallback


# ── PDF extraction helper ─────────────────────────────────────────────────────
def extract_and_chunk_pdf(pdf_base64: str, file_name: str = "document.pdf") -> tuple[str, list[dict], str]:
    """
    Extract text from a base64 PDF, chunk it, and upload to Cloudinary.
    Returns (clean_text, chunks, cloudinary_url_or_empty).
    """
    import base64
    import tempfile
    from pathlib import Path
    from Document_Ingestion.services.PDF_Extractor import extract_pdf_pages
    from Document_Ingestion.services.Text_Cleaner import clean_extracted_text, merge_page_texts
    from Document_Ingestion.services.Cloudinary_Storage import upload_pdf

    # Decode base64 to temp file
    payload = pdf_base64.strip()
    if ',' in payload and payload.lower().startswith('data:'):
        payload = payload.split(',', 1)[1]

    raw = base64.b64decode(payload)
    suffix = Path(file_name).suffix or '.pdf'

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = Path(tmp.name)

    try:
        extraction  = extract_pdf_pages(tmp_path, use_ocr=True)
        clean_text  = clean_extracted_text(merge_page_texts(extraction['page_results']))
        chunks      = chunk_text(clean_text)
        pdf_url     = upload_pdf(tmp_path, file_name) or ''
    finally:
        try:
            tmp_path.unlink()
        except Exception:
            pass

    return clean_text, chunks, pdf_url


# ── Main chat function ────────────────────────────────────────────────────────
def chat(
    session_id:  str,
    user_id:     str,
    message:     str,
    history:     list[dict],   # [{"role": "user"|"assistant", "content": "..."}]
    user_level:  str   = "B1",
    chunks:      list  = None,
) -> dict:
    """
    Process one chat turn. Returns:
    {
        "reply":          str,
        "intent":         str,
        "chunks_used":    list[str],   # chunk_ids
    }
    """
    intent      = detect_intent(message)
    system_tmpl = _SYSTEM.get(intent, _SYSTEM["general"])
    system_text = system_tmpl.format(level=user_level)

    # Feedback loop: inject user's past bad-rating comments
    feedback_note = get_feedback_context(user_id)
    if feedback_note:
        system_text += feedback_note

    # Retrieve relevant document chunks
    used_chunks = []
    context_block = ""
    if chunks:
        relevant = find_relevant_chunks(message, chunks, top_k=2)
        if relevant:
            used_chunks   = [c["chunk_id"] for c in relevant]
            context_parts = "\n\n---\n\n".join(c["text"] for c in relevant)
            context_block = (
                f"\n\n[DOCUMENT CONTEXT — use this to answer]\n{context_parts}\n[END CONTEXT]\n"
            )

    # Build messages array: system → history (last 10) → context + current message
    messages = [{"role": "system", "content": system_text}]

    # Include last 10 history messages for context
    for h in history[-10:]:
        messages.append({"role": h["role"], "content": h["content"]})

    # Append context block to the current user message
    user_content = message
    if context_block:
        user_content = f"{message}{context_block}"

    messages.append({"role": "user", "content": user_content})

    reply = _call_llm(messages)

    return {
        "reply":       reply,
        "intent":      intent,
        "chunks_used": used_chunks,
    }
