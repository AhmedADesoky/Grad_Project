"""
AI-generated per-error explanations via OpenRouter.

The fine-tuned Flan-T5 can correct text but cannot explain individual errors
(it only learned the 'gec:' and 'feedback:' tasks). So for explanations we use
the same OpenRouter instruction-following LLM already used for exam generation.

All errors in a submission are sent in ONE batched request and matched back by
index. If no API key is configured or the call fails, callers fall back to the
local templates — so this never breaks offline.
"""

import json
import logging
import os
from urllib import request, error

Logger = logging.getLogger(__name__)


def is_available() -> bool:
    return bool(_get_keys())


def _get_keys():
    keys = []
    for suffix in ("", "_2", "_3", "_4"):
        k = os.getenv(f"OPENROUTER_API_KEY{suffix}", "").strip()
        if k:
            keys.append(k)
    return keys


def _call(messages, timeout=30, n_errors=1):
    keys = _get_keys()
    if not keys:
        raise RuntimeError("No OPENROUTER_API_KEY configured")

    model    = os.getenv("FEEDBACK_EXPLAIN_MODEL", "google/gemini-2.5-flash-lite")
    base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
    referer  = os.getenv("OPENROUTER_HTTP_REFERER", "http://localhost:8000")
    app_name = os.getenv("OPENROUTER_APP_NAME", "EWC-AI-Backend")

    # 150 tokens per explanation is a generous upper bound; minimum 1200
    max_tok = max(1200, n_errors * 150)
    body = {"model": model, "messages": messages, "temperature": 0.2, "max_tokens": max_tok}
    last_err = None
    for idx, key in enumerate(keys, 1):
        req = request.Request(
            url=f"{base_url}/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "HTTP-Referer": referer,
                "X-Title": app_name,
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            return payload["choices"][0]["message"]["content"]
        except error.HTTPError as e:
            if e.code in (402, 429, 404):
                Logger.warning("Explanation key #%d got HTTP %d — trying next", idx, e.code)
                last_err = e
                continue
            raise
        except Exception as e:  # network/timeout/parse
            last_err = e
            continue
    raise last_err or RuntimeError("OpenRouter call failed")


def _extract_json_array(text):
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.strip("`")
        if "\n" in t:
            t = t.split("\n", 1)[1]
    l, r = t.find("["), t.rfind("]")
    if l != -1 and r != -1 and r > l:
        t = t[l:r + 1]
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        # Response was truncated — recover any complete objects before the cut
        recovered = []
        depth = 0
        obj_start = None
        for i, ch in enumerate(t):
            if ch == '{':
                if depth == 0:
                    obj_start = i
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0 and obj_start is not None:
                    try:
                        recovered.append(json.loads(t[obj_start:i + 1]))
                    except json.JSONDecodeError:
                        pass
                    obj_start = None
        if recovered:
            Logger.info("Partial JSON recovery: got %d/%d objects", len(recovered), t.count('"i"'))
            return recovered
        raise


def llm_correct_text(text: str) -> str:
    """
    Use the OpenRouter LLM to produce a fully corrected version of `text`.

    Returns the corrected text, or '' if the LLM is unavailable / the call
    failed (callers then fall back to the local T5 corrector). The LLM fixes
    grammar, spelling, punctuation, capitalisation and word-choice errors that
    T5-base cannot handle (context typos like raw→row, proper-noun
    capitalisation, sentence-splitting), while preserving the writer's meaning.
    """
    if not text or not text.strip() or not is_available():
        return ""

    system = (
        "You are an English writing corrector. Return a corrected version of the "
        "student's text. Fix ONLY real errors: grammar, verb tense, subject-verb "
        "agreement, spelling, punctuation, capitalisation (including proper nouns "
        "and sentence-initial words), wrong word choice, and split/joined compound "
        "words. Split run-on sentences into proper sentences. Do NOT rewrite for "
        "style, do NOT add or remove ideas, and keep the writer's wording wherever "
        "it is already correct. "
        'Respond ONLY with a JSON object: {"corrected": "<the full corrected text>"}. '
        "No extra text, no explanations."
    )
    user = "Text to correct:\n" + text

    try:
        raw = _call([
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ], n_errors=max(1, len(text.split()) // 10))
        t = (raw or "").strip()
        if t.startswith("```"):
            t = t.strip("`")
            if "\n" in t:
                t = t.split("\n", 1)[1]
        l, r = t.find("{"), t.rfind("}")
        if l != -1 and r != -1 and r > l:
            t = t[l:r + 1]
        obj = json.loads(t)
        corrected = str(obj.get("corrected", "")).strip()
        if corrected:
            Logger.info("LLM correction produced (%d→%d chars)", len(text), len(corrected))
            return corrected
        return ""
    except Exception as exc:
        Logger.warning("LLM correction failed (%s) — falling back to T5", exc)
        return ""


def generate_explanations(errors: list, context_text: str = "") -> bool:
    """
    Fill each error['explanation'] in place with an AI-generated explanation.
    Returns True on success, False if it fell back (caller keeps templates).
    `errors` items must have: type, label, text (original), suggestion.
    """
    actionable = [e for e in errors if e.get('suggestion') and e['suggestion'] not in ('', '[removed]')]
    if not actionable or not is_available():
        return False

    items = [
        {"i": idx, "type": e.get('label', e.get('type', '')),
         "original": e['text'], "correction": e['suggestion']}
        for idx, e in enumerate(actionable)
    ]

    system = (
        "You are an English writing tutor. For each correction, explain in ONE short, "
        "clear sentence WHY the change is needed, aimed at a language learner. "
        "If the 'correction' is not actually an error (e.g. a valid synonym or a "
        "British/American spelling variant), say so plainly. "
        "Respond ONLY with a JSON array of objects: "
        '[{"i": <index>, "explanation": "<one sentence>"}]. No extra text.'
    )
    user = "Corrections to explain:\n" + json.dumps(items, ensure_ascii=False)

    try:
        raw = _call([
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ], n_errors=len(actionable))
        parsed = _extract_json_array(raw)
        by_index = {int(o["i"]): str(o["explanation"]).strip()
                    for o in parsed if isinstance(o, dict) and "i" in o and o.get("explanation")}
        filled = 0
        for idx, e in enumerate(actionable):
            if idx in by_index and by_index[idx]:
                e['explanation'] = by_index[idx]
                filled += 1
        Logger.info("AI explanations filled %d/%d errors", filled, len(actionable))
        return filled > 0
    except Exception as exc:
        Logger.warning("AI explanation generation failed (%s) — using templates", exc)
        return False
