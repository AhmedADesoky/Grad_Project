"""
Plan_Adjuster.py — Intelligent plan adjustment with intent detection.

Supported intents:
  add_task      — add a new task to a specific day
  remove_task   — remove a named task from a specific day
  modify_task   — change an existing task's prompt/duration/skills
  explain_task  — explain a task in detail (does NOT modify the plan)
  get_examples  — return error-correction examples (does NOT modify the plan)
  general       — any other instruction (full AI adjustment)

Response always returns a dict with:
  intent, modified_plan, chat_response, diff_summary
"""

import json
import os
import re
import logging
from copy import deepcopy
from datetime import datetime
from urllib import request, error

# Reuse RAG helpers from Plan_Generator (lazy import to avoid circular deps)
def _get_rag_chunks(skill: str, level: str, top_k: int = 4) -> list[dict]:
    """
    Query Atlas Vector Search for chunks relevant to a skill + level.
    Returns [] if MongoDB is unavailable or embeddings fail — caller degrades gracefully.
    """
    try:
        from Personalized_Plan.services.Plan_Generator import (
            _atlas_vector_search, _truncate_chunk_text
        )
        # CEFR bands: query exact level + one band up for richer context
        _CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]
        idx = _CEFR_ORDER.index(level) if level in _CEFR_ORDER else 0
        bands = [_CEFR_ORDER[i] for i in range(max(0, idx - 1), min(len(_CEFR_ORDER), idx + 2))]
        query = f"{skill} writing practice {level}"
        chunks = _atlas_vector_search(query, bands, top_k=top_k)
        # Truncate text so it doesn't bloat the prompt
        for c in chunks:
            c["text"] = _truncate_chunk_text(c.get("text", ""), limit=400)
        return chunks
    except Exception as e:
        Logger.warning("RAG query failed (adjuster): %s", e)
        return []


def _format_chunk_block(chunks: list[dict]) -> str:
    if not chunks:
        return ""
    lines = ["\nEDUCATIONAL MATERIAL — use as inspiration for the new task prompt and explanation:\n"]
    for i, c in enumerate(chunks, 1):
        lines.append(
            f"[{i}] {c.get('chunk_type','general')} | {c.get('source','material')} | {c.get('cefr_level','')}\n"
            f"{c.get('text','')}\n---"
        )
    return "\n".join(lines)

Logger = logging.getLogger(__name__)

# ── OpenRouter helpers ─────────────────────────────────────────────────────────

def _get_openrouter_keys():
    keys = []
    for suffix in ("", "_2", "_3", "_4", "_5", "_6", "_7", "_8"):
        k = os.getenv(f"OPENROUTER_API_KEY{suffix}", "").strip()
        if k:
            keys.append(k)
    return keys


def _call_openrouter(prompt: str, temperature: float = 0.3, max_tokens: int = 3000) -> str:
    base_url  = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    referer   = os.getenv("OPENROUTER_HTTP_REFERER", "http://localhost:8000")
    app_name  = os.getenv("OPENROUTER_APP_NAME", "EWC-AI-Backend")
    api_keys  = _get_openrouter_keys()
    if not api_keys:
        raise ValueError("No OPENROUTER_API_KEY configured")

    _builtin_fallbacks = [
        "openai/gpt-4o-mini",
        "openai/gpt-oss-120b:free",
        "google/gemini-2.5-flash",
        "nvidia/nemotron-3-super-120b-a12b:free",
    ]
    primary   = os.getenv("OPENROUTER_MODEL", "openai/gpt-4.1-nano")
    secondary = os.getenv("OPENROUTER_FREE_MODEL", "openai/gpt-oss-120b:free")
    models_to_try = [m for m in [primary, secondary] + _builtin_fallbacks if m]
    seen = set()
    models_to_try = [m for m in models_to_try if not (m in seen or seen.add(m))]

    last_err = None
    max_retries = len(api_keys)  # try every available key before giving up
    for mdl in models_to_try:
        for idx, api_key in enumerate(api_keys[:max_retries], 1):
            body = {
                "model": mdl,
                "messages": [
                    {"role": "system", "content": "Return ONLY valid JSON. No markdown, no extra text."},
                    {"role": "user",   "content": prompt},
                ],
                "temperature": temperature,
                "max_tokens":  max_tokens,
            }
            req = request.Request(
                url=f"{base_url}/chat/completions",
                data=json.dumps(body).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type":  "application/json",
                    "HTTP-Referer":  referer,
                    "X-Title":       app_name,
                },
                method="POST",
            )
            try:
                with request.urlopen(req, timeout=90) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
                Logger.info("Adjuster succeeded with model: %s", mdl)
                return payload["choices"][0]["message"]["content"]
            except error.HTTPError as e:
                if e.code in (400, 402, 404, 429):
                    Logger.warning("Adjuster model %s key #%d got HTTP %d, trying next", mdl, idx, e.code)
                    last_err = e
                    if e.code in (400, 404):
                        break  # bad model — skip all keys for this model
                    continue
                raise
    raise last_err or RuntimeError("All models and API keys exhausted")


def _repair_json(text: str) -> str:
    """Apply a series of heuristic repairs to make AI-generated JSON parseable."""
    # Strip markdown fences
    text = re.sub(r"^```(?:json)?\s*", "", text.strip())
    text = re.sub(r"```\s*$", "", text)
    # Extract outermost {...}
    left  = text.find("{")
    right = text.rfind("}")
    if left != -1 and right > left:
        text = text[left:right + 1]
    # Remove trailing commas before ] or }
    text = re.sub(r",\s*([}\]])", r"\1", text)
    # Replace literal tab/newline inside string values with \n \t
    # (find strings and escape raw control chars inside them)
    def _escape_string_contents(m):
        inner = m.group(1)
        inner = inner.replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")
        return f'"{inner}"'
    # Match "..." including across lines — replace unescaped newlines inside
    text = re.sub(r'"((?:[^"\\]|\\.)*)"', _escape_string_contents, text, flags=re.DOTALL)
    return text


def _safe_json(text: str) -> dict:
    text = (text or "").strip()
    # Strategy 1: direct parse after repair
    try:
        return json.loads(_repair_json(text))
    except Exception:
        pass

    # Strategy 2: find and parse each top-level field individually
    # Extract just the scalar fields we always need, ignore modified_days parse errors
    result = {}
    for field in ("intent", "chat_response", "diff_summary"):
        m = re.search(rf'"{field}"\s*:\s*"((?:[^"\\]|\\.)*)"', text)
        if m:
            result[field] = m.group(1).replace("\\n", "\n")

    # Try to extract modified_days as a raw array
    days_match = re.search(r'"modified_days"\s*:\s*(\[.*?\])\s*[,}]', text, re.DOTALL)
    if days_match:
        try:
            result["modified_days"] = json.loads(_repair_json(days_match.group(1)))
        except Exception:
            result["modified_days"] = None
    else:
        null_match = re.search(r'"modified_days"\s*:\s*null', text)
        result["modified_days"] = None if null_match else None

    if result.get("intent"):
        return result

    raise ValueError(f"Could not parse AI response as JSON (all strategies failed). Raw: {text[:200]}")


# ═══════════════════════════════════════════════════════════════════════════════
# INPUT UNDERSTANDING — days, tasks, skills, intents, spelling
# ═══════════════════════════════════════════════════════════════════════════════

# ── Levenshtein edit distance ─────────────────────────────────────────────────

def _edit_distance(a: str, b: str) -> int:
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev, dp[0] = dp[0], i
        for j in range(1, n + 1):
            prev, dp[j] = dp[j], prev if a[i-1] == b[j-1] else 1 + min(prev, dp[j], dp[j-1])
    return dp[n]


def _fuzzy_match(word: str, candidates: list[str], max_dist: int = 2) -> str | None:
    """Closest candidate within max_dist edits, None if nothing close enough."""
    best, best_d = None, max_dist + 1
    for c in candidates:
        d = _edit_distance(word, c)
        if d < best_d:
            best, best_d = c, d
    return best if best_d <= max_dist else None


# ── Day resolution ─────────────────────────────────────────────────────────────

_DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

# All abbreviations and common misspellings → canonical lowercase day name
_DAY_MAP: dict[str, str] = {
    # Standard abbreviations
    "sun": "sunday", "mon": "monday",
    "tue": "tuesday", "tues": "tuesday",
    "wed": "wednesday",
    "thu": "thursday", "thur": "thursday", "thurs": "thursday",
    "fri": "friday",
    "sat": "saturday",
    # Common misspellings
    "tuseday": "tuesday",  "tusday": "tuesday",   "teusday":   "tuesday",
    "tuesady": "tuesday",  "tuesdey": "tuesday",  "tuesdaye":  "tuesday",
    "munday":  "monday",   "mondy":   "monday",   "monda":     "monday",
    "wendsday":"wednesday","wendesday":"wednesday","wensday":   "wednesday",
    "wednasday":"wednesday","wedensday":"wednesday","wendsday": "wednesday",
    "thrusday":"thursday", "thurday":  "thursday", "thurdsay":  "thursday",
    "thusday": "thursday", "thursdey": "thursday", "thurstday": "thursday",
    "saterday":"saturday", "satuday":  "saturday", "satarday":  "saturday",
    "saturdy": "saturday", "satrday":  "saturday",
    "sunady":  "sunday",   "snday":    "sunday",
    "fridey":  "friday",   "fridy":    "friday",   "firday":    "friday",
    # Relative / ordinal words
    "today":     "__today__",
    "tomorrow":  "__tomorrow__",
    "yesterday": "__yesterday__",
    "weekday":   "__weekday__",
    "weekend":   "__weekend__",
    "firstday":  "sunday",   "lastday": "saturday",
}

# Ordinal word → 0-based index (Sunday=0)
_ORDINAL_MAP: dict[str, int] = {
    "first": 0, "1st": 0, "second": 1, "2nd": 1,
    "third": 2, "3rd": 2, "fourth": 3, "4th": 3,
    "fifth": 4, "5th": 4, "sixth":  5, "6th": 5,
    "seventh": 6, "7th": 6,
}


def _resolve_relative_day(token: str) -> str | None:
    """Convert __today__ / __tomorrow__ etc. to a real day name."""
    from datetime import date, timedelta
    today = date.today().weekday()          # Mon=0 … Sun=6
    # Python weekday → our Sunday=0 index
    py_to_us = {0:"monday",1:"tuesday",2:"wednesday",3:"thursday",
                4:"friday",5:"saturday",6:"sunday"}
    if token == "__today__":
        return py_to_us[today].capitalize()
    if token == "__tomorrow__":
        return py_to_us[(today + 1) % 7].capitalize()
    if token == "__yesterday__":
        return py_to_us[(today - 1) % 7].capitalize()
    if token == "__weekday__":
        return None   # ambiguous — let caller decide
    if token == "__weekend__":
        return "Saturday"
    return None


def _extract_day_from_text(text: str, available_days: list[str] | None = None) -> str | None:
    """
    Robustly extract a day name from free text. Handles:
      • Exact names: "monday", "Tuesday"
      • Abbreviations: "mon", "wed", "thu"
      • Common misspellings: "tuseday", "wendsday", "thrusday"
      • Relative words: "today", "tomorrow", "yesterday"
      • Ordinals: "the first day", "day 2", "2nd day"
      • Fuzzy match (≤2 edits) as last resort
    If available_days is given, restricts results to that set.
    """
    words = re.findall(r"\b\w+\b", text.lower())

    # Pass 1: exact map lookup
    for w in words:
        mapped = _DAY_MAP.get(w)
        if mapped:
            if mapped.startswith("__"):
                resolved = _resolve_relative_day(mapped)
                if resolved:
                    return resolved
            else:
                return mapped.capitalize()

    # Pass 2: ordinal + "day" pattern — "the first day", "day 2"
    ordinal_pat = re.search(
        r"\b(?:day\s*(\d)|(\d)\s*(?:st|nd|rd|th)?\s*day|"
        r"(first|second|third|fourth|fifth|sixth|seventh)\s*day)\b",
        text.lower()
    )
    if ordinal_pat:
        num_str = ordinal_pat.group(1) or ordinal_pat.group(2)
        word_str = ordinal_pat.group(3)
        idx = None
        if num_str:
            idx = int(num_str) - 1
        elif word_str:
            idx = _ORDINAL_MAP.get(word_str)
        if idx is not None and 0 <= idx < len(_DAY_NAMES):
            day = _DAY_NAMES[idx]
            if available_days is None or day.capitalize() in available_days:
                return day.capitalize()

    # Pass 3: fuzzy match for longer words (≥ 4 chars) against canonical day names
    for w in words:
        if len(w) >= 4:
            hit = _fuzzy_match(w, _DAY_NAMES, max_dist=2)
            if hit:
                if available_days is None or hit.capitalize() in available_days:
                    return hit.capitalize()

    return None


# ── Skill detection ────────────────────────────────────────────────────────────

_SKILL_KEYWORDS: dict[str, list[str]] = {
    "grammar":     ["grammar", "grammer", "gramm", "gramer", "grammatical",
                    "grammatik", "tense", "tenses", "verb", "syntax", "sentence structure"],
    "vocabulary":  ["vocabulary", "vocabular", "vocabulery", "vocabulry",
                    "vocab", "vocabs", "word", "words", "lexis", "lexical",
                    "synonyms", "antonyms", "definition"],
    "punctuation": ["punctuation", "punctuate", "punctuat", "puntuation",
                    "punctation", "punchtuation", "comma", "commas",
                    "apostrophe", "apostrophes", "semicolon", "colon",
                    "full stop", "period", "exclamation", "question mark",
                    "hyphen", "quotation"],
    "writing":     ["writing", "write", "writting", "writng", "essay",
                    "paragraph", "paragraf", "composition", "draft",
                    "sentence", "passage", "text"],
    "reading":     ["reading", "read", "comprehension", "passage", "article",
                    "understand", "analyse", "analyze"],
}

_SKILL_NAMES = list(_SKILL_KEYWORDS.keys())


def _detect_skill(text: str) -> str:
    msg = text.lower()
    for skill, keywords in _SKILL_KEYWORDS.items():
        if any(k in msg for k in keywords):
            return skill
    for word in re.findall(r"\b\w{4,}\b", msg):
        hit = _fuzzy_match(word, _SKILL_NAMES, max_dist=2)
        if hit:
            return hit
    return "writing"


# ── Intent detection ───────────────────────────────────────────────────────────

_INTENT_KEYWORDS: dict[str, list[str]] = {
    "remove_task": [
        "remove", "remov", "delete", "delet", "drop", "cancel", "take out",
        "get rid", "eliminate", "erase", "don't want", "do not want",
        "no need", "unnecessary", "skip", "stop", "cut",
    ],
    "add_task": [
        "add", "addd", "create", "insert", "include", "put", "need more",
        "want more", "give me", "new task", "extra task", "another task",
        "more task", "practice", "exercise",
    ],
    "modify_task": [
        "change", "update", "modify", "modifiy", "edit", "adjust",
        "make shorter", "make longer", "make easier", "make harder",
        "shorten", "lengthen", "simplify", "reduce", "extend",
        "rename", "different prompt", "different topic",
    ],
    "explain_task": [
        "explain", "explane", "explian", "what is", "what are", "tell me about",
        "describe", "clarify", "i don't understand", "i dont understand",
        "don't get", "dont get", "confused", "what does", "what should i do",
        "how do i", "help me understand", "elaborate", "what does this mean",
        "what means", "meaning of",
    ],
    "get_examples": [
        "example", "examples", "show me", "give example", "give me example",
        "sample", "samples", "demonstrate", "illustrate", "like what",
        "such as", "for instance", "show example", "practice example",
    ],
}


def _strip_pinned_prefix(text: str) -> str:
    """
    Remove the frontend-generated 'Tell me about "Task Title": ' prefix.
    When the user pins a task, the input is pre-filled with this prefix and
    the user's actual instruction follows after the colon. Keeping the prefix
    causes 'tell me about' to dominate intent scoring even when the real
    intent is 'remove' or 'modify'.
    """
    m = re.match(r'^[Tt]ell me about\s+"[^"]*"\s*:\s*', text)
    return text[m.end():].strip() if m else text


def _detect_intent(text: str) -> str:
    """
    Classify the user instruction into one of 6 intents.
    Returns the intent name or 'general' if ambiguous.
    """
    # Score on the user's actual instruction, not the auto-generated prefix
    msg = _strip_pinned_prefix(text).lower()
    scores: dict[str, int] = {k: 0 for k in _INTENT_KEYWORDS}

    for intent, keywords in _INTENT_KEYWORDS.items():
        for kw in keywords:
            if kw in msg:
                scores[intent] += len(kw.split())   # longer phrase = stronger signal

    best_intent = max(scores, key=lambda k: scores[k])
    if scores[best_intent] == 0:
        return "general"
    return best_intent


# ── Task title fuzzy finder ────────────────────────────────────────────────────

def _find_best_task_match(instruction: str, plan: dict,
                           period_index: int, day_name: str | None) -> dict | None:
    """
    Find the task the user is most likely referring to.
    Tries (in order):
      1. Pinned task (already resolved by caller)
      2. Quoted title exact/substring match  "Task Name"
      3. Word-overlap score across all tasks in the period
      4. Fuzzy title match (Levenshtein on title words)
    Returns the task dict or None.
    """
    periods = plan.get("plan", [])
    if not periods or period_index >= len(periods):
        return None

    # Collect all tasks in the period (optionally filtered to day)
    candidates: list[dict] = []
    for day in periods[period_index].get("days", []):
        if day_name and day.get("day", "").lower() != day_name.lower():
            continue
        for t in day.get("tasks", []):
            candidates.append(t)

    if not candidates:
        return None

    # Strategy 1: quoted string in instruction
    quoted = re.findall(r'"([^"]+)"', instruction)
    for q in quoted:
        q_low = q.lower()
        for t in candidates:
            if q_low in t.get("title", "").lower():
                return t

    # Strategy 2: word overlap
    stop = {"the","a","an","task","on","i","want","to","please","can",
            "could","you","this","my","me","it","is","are","was","be"}
    instr_words = set(re.findall(r"\b\w+\b", instruction.lower())) - stop

    best_t, best_score = None, 0
    for t in candidates:
        title_words = set(re.findall(r"\b\w+\b", t.get("title","").lower()))
        # Exact word overlap
        overlap = len(instr_words & title_words)
        # Fuzzy overlap (each instruction word vs each title word)
        fuzzy_bonus = sum(
            1 for iw in instr_words for tw in title_words
            if iw != tw and len(iw) >= 4 and _edit_distance(iw, tw) <= 1
        )
        score = overlap * 2 + fuzzy_bonus
        if score > best_score:
            best_t, best_score = t, score

    return best_t if best_score > 0 else candidates[0]  # fallback: first task


# ── Plan diff ─────────────────────────────────────────────────────────────────

def _compute_diff(original: dict, updated: dict, period_index: int) -> str:
    orig_periods = original.get("plan", [])
    upd_periods  = updated.get("plan", [])
    if period_index >= len(orig_periods) or period_index >= len(upd_periods):
        return "Plan updated."

    def _task_map(periods, idx):
        res = {}
        for d in periods[idx].get("days", []):
            for t in d.get("tasks", []):
                key = t.get("task_id") or t.get("title", "")
                if key:
                    res[key] = t
        return res

    orig_t = _task_map(orig_periods, period_index)
    upd_t  = _task_map(upd_periods,  period_index)

    added   = [t.get("title","?") for k, t in upd_t.items()  if k not in orig_t]
    removed = [t.get("title","?") for k, t in orig_t.items() if k not in upd_t]
    changed = [t.get("title","?") for k, t in upd_t.items()
               if k in orig_t and t.get("prompt") != orig_t[k].get("prompt")]

    parts = []
    if added:   parts.append(f"Added: {', '.join(added)}")
    if removed: parts.append(f"Removed: {', '.join(removed)}")
    if changed: parts.append(f"Modified: {', '.join(changed)}")
    return ". ".join(parts) if parts else "Plan updated."


def _get_day_tasks(plan: dict, period_index: int, day_name: str | None) -> list:
    periods = plan.get("plan", [])
    if not periods or period_index >= len(periods):
        return []
    days = periods[period_index].get("days", [])
    if day_name:
        for d in days:
            if d.get("day", "").lower() == day_name.lower():
                return d.get("tasks", [])
    return days[0].get("tasks", []) if days else []


# ── Instruction normaliser ────────────────────────────────────────────────────

_WORD_CORRECTIONS: dict[str, str] = {
    # All day misspellings also in _DAY_MAP for belt-and-suspenders
    "tuseday":"tuesday","tusday":"tuesday","teusday":"tuesday",
    "wendsday":"wednesday","wendesday":"wednesday","wensday":"wednesday",
    "thrusday":"thursday","thurday":"thursday","thurdsay":"thursday",
    "thusday":"thursday","saterday":"saturday","satuday":"saturday",
    "munday":"monday","mondy":"monday",
    "fridey":"friday","fridy":"friday","firday":"friday",
    # Skills
    "grammer":"grammar","gramer":"grammar","gramm":"grammar",
    "vocabulery":"vocabulary","vocabulry":"vocabulary","vocabular":"vocabulary",
    "punctation":"punctuation","puntuation":"punctuation","punchtuation":"punctuation",
    "writting":"writing","writng":"writing","paragraf":"paragraph",
    # Actions
    "delet":"delete","remov":"remove","addd":"add",
    "explane":"explain","explian":"explain","expain":"explain",
    "modifiy":"modify","cahnge":"change","chnage":"change",
    # Common typos
    "teh":"the","adn":"and","fo":"of","taht":"that","wiht":"with",
}


def _normalise_instruction(text: str) -> str:
    """
    Normalise an instruction string:
    1. Word-level spelling correction (dict lookup)
    2. Day-map lookup (covers all abbreviations + misspellings)
    3. Fuzzy day matching (≤2 edits) for anything ≥5 chars
    Task titles inside quotes are preserved unchanged.
    """
    # Protect quoted substrings (task titles etc.) from correction
    quoted: list[str] = re.findall(r'"[^"]*"', text)
    placeholder = "\x00QUOTED{}\x00"
    for i, q in enumerate(quoted):
        text = text.replace(q, placeholder.format(i), 1)

    def _replace(m: re.Match) -> str:
        w = m.group(0)
        lower = w.lower()
        cap = w[0].isupper()
        # 1. Exact word correction
        if lower in _WORD_CORRECTIONS:
            c = _WORD_CORRECTIONS[lower]
            return c.capitalize() if cap else c
        # 2. Day map (covers abbreviations + known misspellings)
        mapped = _DAY_MAP.get(lower)
        if mapped:
            if not mapped.startswith("__"):
                return mapped.capitalize() if cap else mapped
            # Relative word (today/tomorrow/yesterday) — recognised but handled later;
            # return unchanged and skip fuzzy matching so "today" never becomes "Monday".
            return w
        # 3. Fuzzy day match for longer words
        if len(lower) >= 5:
            hit = _fuzzy_match(lower, _DAY_NAMES, max_dist=2)
            if hit:
                return hit.capitalize() if cap else hit
        return w

    text = re.sub(r"\b[a-zA-Z]+\b", _replace, text)

    # Restore quoted substrings
    for i, q in enumerate(quoted):
        text = text.replace(placeholder.format(i), q, 1)

    return text


# ── Adaptive depth ─────────────────────────────────────────────────────────────

def _depth_instruction(instruction: str, chat_depth: int) -> str:
    msg = instruction.lower()
    if any(k in msg for k in ("brief", "quick", "short", "summary", "tldr")):
        return (
            "EXPLANATION DEPTH: Brief. Give 1-2 sentences only. No examples needed."
        )
    if any(k in msg for k in ("detail", "explain more", "why", "don't understand",
                               "confused", "elaborate", "more", "fully")):
        return (
            "EXPLANATION DEPTH: Detailed. Give a full paragraph with the grammar rule, "
            "an example error, the correction, and why it works. Use simple language."
        )
    if chat_depth >= 2:
        return (
            "EXPLANATION DEPTH: The user has asked follow-up questions on this topic — "
            "automatically give a longer, more detailed explanation with step-by-step examples."
        )
    return (
        "EXPLANATION DEPTH: Moderate. 2-4 sentences. Include the rule and one example."
    )


# ── Prompt builders ────────────────────────────────────────────────────────────

def _build_prompt(
    plan: dict,
    instruction: str,
    period_index: int,
    day_name: str | None,
    pinned_task: dict | None,
    chat_depth: int,
) -> str:
    level       = plan.get("cefr_level", "A1")
    focus       = plan.get("focus_skills", [])
    depth_instr = _depth_instruction(instruction, chat_depth)

    periods = plan.get("plan", [])
    current_period_days = []
    available_days = []
    if period_index < len(periods):
        current_period_days = periods[period_index].get("days", [])
        available_days = [d.get("day") for d in current_period_days]

    # Pre-detect intent and best task so we can give the AI richer context
    pre_intent  = _detect_intent(instruction)
    best_task   = pinned_task or _find_best_task_match(instruction, plan, period_index, day_name)
    # Instruction text takes priority: if the user named a day explicitly, use that.
    # Only fall back to the UI-selected day (day_name) when no day is found in text.
    instruction_day = _extract_day_from_text(instruction)
    target_day  = instruction_day or day_name or _extract_day_from_text(instruction, available_days)

    pinned_block = ""
    if best_task:
        pinned_block = (
            f"\nREFERENCED TASK (most likely the task the user means):\n"
            f"{json.dumps({'task_id': best_task.get('task_id'), 'title': best_task.get('title'), 'prompt': best_task.get('prompt'), 'skills': best_task.get('skills')})}\n"
        )

    # Existing task titles — injected so AI avoids creating duplicates
    existing_titles = sorted(_collect_existing_titles(plan, period_index))
    existing_block  = (
        f"\nEXISTING TASK TITLES IN THIS PERIOD (do NOT duplicate any of these):\n"
        + "\n".join(f"  - {t}" for t in existing_titles) + "\n"
    ) if existing_titles else ""

    # RAG context: only for add_task — gives AI real educational material to write a good prompt
    rag_block = ""
    if pre_intent == "add_task":
        skill  = _detect_skill(instruction)
        chunks = _get_rag_chunks(skill, level)
        rag_block = _format_chunk_block(chunks)

    # Build a strong day-lock block — this is the #1 LLM mistake: ignoring the target day
    if target_day:
        # Also show existing tasks for that day so LLM knows to KEEP them
        target_day_tasks = []
        for d in current_period_days:
            if d.get("day", "").lower() == target_day.lower():
                target_day_tasks = d.get("tasks", [])
                break
        existing_tasks_block = (
            f"\nEXISTING TASKS IN {target_day.upper()} (you MUST keep ALL of these — never remove or replace them):\n"
            + json.dumps(
                [{"task_id": t.get("task_id"), "title": t.get("title")} for t in target_day_tasks],
                separators=(',', ':')
            ) + "\n"
        ) if target_day_tasks else ""
        day_block = (
            f"⚠ TARGET DAY: {target_day} — add/modify tasks ONLY in {target_day}. "
            f"Do NOT touch any other day.\n"
            f"{existing_tasks_block}"
        )
    else:
        day_block = ""

    hint_block = f"Pre-detected intent hint (may be wrong — override if you disagree): {pre_intent}\n"

    return f"""You are a CEFR-aligned English writing plan assistant. Return ONLY valid JSON — no markdown, no extra text, no newlines inside string values (use \\n if needed).

Student level: {level}
Focus skills: {focus}
{day_block}{hint_block}{existing_block}{pinned_block}{depth_instr}{rag_block}

Current period days (the ONLY data you may modify):
{json.dumps(current_period_days, separators=(',', ':'))}

User message: "{instruction}"

RULES:
1. Final intent must be one of: add_task | remove_task | modify_task | explain_task | get_examples | general
2. For explain_task or get_examples: set modified_days to null.
3. For add_task: append ONE new task to "{target_day or 'the day mentioned'}". ALL existing tasks in that day MUST remain unchanged. Generate task_id "new_{(target_day or 'day').lower()[:3]}_1". ALWAYS return modified_days.
4. For remove_task: remove ONLY the referenced task. Keep all other tasks. ALWAYS return modified_days.
5. For modify_task: change only what the user asked. Keep all other tasks unchanged. ALWAYS return modified_days.
6. For explain_task: write a clear, {level}-appropriate explanation of the referenced task. Put it in "explanation" field.
7. For get_examples: provide 3 error/correction pairs relevant to the referenced task's skills.
8. Misspellings in the user message are already corrected — trust the corrected text.
9. NEVER regenerate, replace, or reorder existing tasks. Only ADD new ones or REMOVE the exact task requested.

Return EXACTLY this JSON:
{{
  "intent": "<intent>",
  "modified_days": <updated days array or null>,
  "chat_response": "<1-2 concise professional sentences — no filler openers like 'Great!', 'Sure!', 'Absolutely!', or 'Of course!'. Start directly with what was done or what the task is about.>",
  "diff_summary": "<what changed, e.g. 'Added Grammar Practice to Tuesday'>",
  "explanation": "<full explanation if explain_task, else null>",
  "examples": <list of 3 items if get_examples, else null>
}}

Each examples item: {{"error": "...", "correction": "...", "reason": "..."}}
Task object shape: {{"task_id":"...","title":"...","prompt":"...","type":"writing_task","estimated_minutes":30,"skills":[],"status":"todo","explanation":"...","example_error":"...","example_correction":"...","correction_reason":"...","materials":[]}}"""


# ── Fallback task templates — multiple variants per skill ──────────────────────
# Each skill has a list of distinct tasks. _fallback_add_task picks the first
# whose title does NOT already exist anywhere in the current period.

_SKILL_TASK_VARIANTS: dict[str, list[dict]] = {
    "grammar": [
        {
            "title":  "Grammar Practice",
            "prompt": "Write 5 sentences each demonstrating a different grammar rule (e.g. subject-verb agreement, correct tense, article use). Underline the grammar structure in each.",
            "skills": ["grammar", "writing"],
        },
        {
            "title":  "Tense Correction Exercise",
            "prompt": "Rewrite the following 5 sentences by correcting the verb tenses: 1) She go to school yesterday. 2) He has eat lunch. 3) They will went home. 4) I am study now. 5) We have saw the film. Explain what was wrong in each.",
            "skills": ["grammar", "writing"],
        },
        {
            "title":  "Sentence Structure Building",
            "prompt": "Write 3 simple sentences, then expand each into a compound sentence using 'and / but / or', then into a complex sentence using 'because / although / when'. Show all three versions.",
            "skills": ["grammar", "writing"],
        },
        {
            "title":  "Article and Preposition Practice",
            "prompt": "Fill in the correct article (a / an / the / —) and preposition in this passage, then rewrite it in full. Write a second paragraph using 5 sentences where you choose articles and prepositions yourself.",
            "skills": ["grammar", "writing"],
        },
        {
            "title":  "Error Identification Task",
            "prompt": "Write a short paragraph of 80 words deliberately containing 5 grammar mistakes. Then write the corrected version below it. Label each correction with the rule it follows.",
            "skills": ["grammar", "writing"],
        },
    ],
    "vocabulary": [
        {
            "title":  "Vocabulary in Context",
            "prompt": "Write a paragraph of 80-100 words on any topic, using at least 5 words you have learned recently. Underline each new word and write its meaning in brackets after the paragraph.",
            "skills": ["vocabulary", "writing"],
        },
        {
            "title":  "Synonym Substitution",
            "prompt": "Take a paragraph you have written before and replace 5 basic words (e.g. 'good', 'big', 'said') with more precise synonyms. Explain why each synonym is a better choice.",
            "skills": ["vocabulary", "writing"],
        },
        {
            "title":  "Word Family Practice",
            "prompt": "Choose 3 words (e.g. 'create'). For each, write its noun form, adjective form, and adverb form. Then write one sentence using each of the 12 forms in context.",
            "skills": ["vocabulary", "writing"],
        },
        {
            "title":  "Collocation Discovery",
            "prompt": "Choose a topic (food / travel / technology). List 5 collocations related to that topic (e.g. 'heavy traffic', 'make a decision'). Write one sentence for each collocation.",
            "skills": ["vocabulary", "writing"],
        },
    ],
    "punctuation": [
        {
            "title":  "Punctuation Practice",
            "prompt": "Write a paragraph of 60-80 words, then rewrite it correcting all punctuation: commas, full stops, apostrophes, and capital letters.",
            "skills": ["punctuation", "writing"],
        },
        {
            "title":  "Comma Rules Exercise",
            "prompt": "Write 6 sentences — one demonstrating each comma rule: (1) after introductory clause, (2) before conjunction, (3) in a list, (4) around parenthetical phrase, (5) before direct speech, (6) after transition word.",
            "skills": ["punctuation", "writing"],
        },
        {
            "title":  "Apostrophe Correction Task",
            "prompt": "Rewrite these 5 sentences correcting the apostrophe errors: 1) Its raining outside. 2) The dogs bone is lost. 3) She cant come today. 4) The childrens toys are here. 5) Its a beautiful day, isnt it?",
            "skills": ["punctuation", "writing"],
        },
        {
            "title":  "Dialogue Punctuation",
            "prompt": "Write a short dialogue (10 lines) between two people discussing their weekend plans. Pay careful attention to punctuating speech correctly: inverted commas, commas, exclamation marks, and question marks.",
            "skills": ["punctuation", "writing"],
        },
    ],
    "writing": [
        {
            "title":  "Free Writing Task",
            "prompt": "Write 80-100 words on a topic of your choice. Focus on using correct grammar and punctuation.",
            "skills": ["writing", "grammar"],
        },
        {
            "title":  "Descriptive Paragraph",
            "prompt": "Describe a place you know well (your room, a market, a park) in 80-100 words. Use at least 3 adjectives, 2 adverbs, and one simile ('as … as' or 'like …').",
            "skills": ["writing"],
        },
        {
            "title":  "Opinion Writing",
            "prompt": "Write 80-100 words giving your opinion on this statement: 'Social media does more harm than good.' State your view, give one reason, and one example.",
            "skills": ["writing"],
        },
        {
            "title":  "Email Writing Practice",
            "prompt": "Write a short informal email (80-100 words) to a friend describing something interesting that happened to you this week. Include an opening greeting, main news, and a closing question.",
            "skills": ["writing"],
        },
    ],
    "reading": [
        {
            "title":  "Reading Comprehension",
            "prompt": "Read a short article on a topic you enjoy. Write 3-4 sentences summarising the main idea and one sentence giving your opinion.",
            "skills": ["reading", "writing"],
        },
        {
            "title":  "Summarising Practice",
            "prompt": "Find a news article or a chapter of a book. Write a 60-80 word summary covering: (1) who/what the text is about, (2) the main event or argument, (3) the outcome or conclusion.",
            "skills": ["reading", "writing"],
        },
    ],
}


def _collect_existing_titles(plan: dict, period_index: int) -> set[str]:
    """Return all task titles (lowercase) already in the current period."""
    titles: set[str] = set()
    periods = plan.get("plan", [])
    if period_index < len(periods):
        for day in periods[period_index].get("days", []):
            for task in day.get("tasks", []):
                t = task.get("title", "").lower().strip()
                if t:
                    titles.add(t)
    return titles


def _fallback_add_task(plan: dict, period_index: int, day_name: str | None,
                        instruction: str = "") -> dict:
    plan    = deepcopy(plan)
    periods = plan.get("plan", [])
    if not periods:
        return plan
    period = periods[min(period_index, len(periods) - 1)]
    days   = period.get("days", [])

    # Resolve target day from instruction text first, then UI selection, then first day
    resolved_day = _extract_day_from_text(instruction) or day_name
    target = days[0]
    if resolved_day:
        for d in days:
            if d.get("day", "").lower() == resolved_day.lower():
                target = d
                break

    skill    = _detect_skill(instruction)
    variants = _SKILL_TASK_VARIANTS.get(skill, _SKILL_TASK_VARIANTS["writing"])

    # Pick the first variant whose title doesn't already exist in the period
    existing = _collect_existing_titles(plan, period_index)
    chosen   = None
    for v in variants:
        if v["title"].lower() not in existing:
            chosen = v
            break
    # All variants already exist → append a numbered suffix to the first one
    if chosen is None:
        base = variants[0]
        suffix = sum(1 for t in existing if base["title"].lower() in t) + 1
        chosen = {
            "title":  f"{base['title']} {suffix}",
            "prompt": base["prompt"],
            "skills": base["skills"],
        }

    n    = len(target.get("tasks", [])) + 1
    day3 = target.get("day", "new").lower()[:3]

    target.setdefault("tasks", []).append({
        "task_id":           f"{day3}_{skill[:4]}_{n}",
        "title":             chosen["title"],
        "prompt":            chosen["prompt"],
        "type":              "writing_task",
        "estimated_minutes": 30,
        "skills":            chosen["skills"],
        "status":            "todo",
        "explanation":       chosen.get("explanation", ""),
        "example_error":     chosen.get("example_error", ""),
        "example_correction": chosen.get("example_correction", ""),
        "correction_reason": chosen.get("correction_reason", ""),
        "materials":         [{"title": "Purdue OWL",
                               "url":   "https://owl.purdue.edu/owl/general_writing/",
                               "source": "Purdue OWL"}],
    })
    return plan


def _fallback_remove_task(plan: dict, period_index: int, instruction: str,
                          day_name: str | None, pinned_task: dict | None = None) -> dict:
    """Best-effort removal: use pinned_task first, then title word-overlap scoring."""
    plan = deepcopy(plan)
    periods = plan.get("plan", [])
    if not periods:
        return plan

    # Fast path: if caller already resolved the exact task, remove by task_id / title
    if pinned_task:
        pinned_id    = pinned_task.get("task_id")
        pinned_title = pinned_task.get("title", "").lower()
        for period in periods:
            for day in period.get("days", []):
                tasks = day.get("tasks", [])
                for i, task in enumerate(tasks):
                    if (pinned_id and task.get("task_id") == pinned_id) or \
                       task.get("title", "").lower() == pinned_title:
                        tasks.pop(i)
                        return plan

    # Prefer day extracted from instruction text over the UI-selected day
    resolved_day = _extract_day_from_text(instruction) or day_name

    _STOP = {"the", "a", "an", "task", "remove", "delete", "on", "i", "want",
             "you", "to", "please", "can", "could", "would"}
    words = set(re.findall(r"\w+", instruction.lower())) - _STOP

    best_score = 0
    best_day   = None
    best_idx   = None

    for period in periods:
        for day in period.get("days", []):
            if resolved_day and day.get("day", "").lower() != resolved_day.lower():
                continue
            for i, task in enumerate(day.get("tasks", [])):
                title_words = set(re.findall(r"\w+", task.get("title", "").lower()))
                score = len(words & title_words)
                if score > best_score:
                    best_score = score
                    best_day   = day
                    best_idx   = i

    if best_day is not None and best_idx is not None and best_score > 0:
        best_day["tasks"].pop(best_idx)

    return plan


# ── Main entry ─────────────────────────────────────────────────────────────────

def Adjust_Plan(
    current_plan: dict,
    instruction: str,
    selected_period_index: int = 0,
    selected_day_index: int | None = None,
    target_day: str | None = None,
    pinned_task: dict | None = None,
    chat_depth: int = 0,
) -> dict:
    """
    Adjust a plan based on a user instruction.
    Returns a dict with keys: intent, modified_plan, chat_response, diff_summary.
    """
    if isinstance(current_plan, str):
        current_plan = json.loads(current_plan)

    if not isinstance(current_plan, dict) or "plan" not in current_plan:
        raise ValueError("current_plan must be a dict with a 'plan' key")

    period_idx = int(selected_period_index or 0)

    # Resolve target_day: explicit param > selected_day_index > None
    day_name = target_day
    if not day_name and selected_day_index is not None:
        day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        try:
            day_name = day_names[int(selected_day_index)]
        except (IndexError, ValueError):
            pass

    # Normalise spelling before anything else so all code paths see clean text
    instruction = _normalise_instruction(instruction)

    # Strip the "Tell me about 'X': " pinned-task prefix for all internal logic.
    # The pinned task itself is passed separately; keeping the prefix in the
    # instruction pollutes intent detection and day extraction.
    instruction_for_logic = _strip_pinned_prefix(instruction)

    # If day_name is already known (from Target_Day / selected_day_index), substitute
    # relative words like "today" with it BEFORE extracting a day from the instruction.
    # This prevents date.today() on the server (which may be in a different timezone)
    # from overriding the day the user is actually viewing in their browser.
    # If the user explicitly names a different concrete day ("add on Monday"), that will
    # still win because _extract_day_from_text will find "Monday" after substitution.
    _relative_patterns = {
        r'\btoday\b':     None,   # filled below
        r'\btonight\b':   None,
        r'\btomorrow\b':  None,
        r'\byesterday\b': None,
    }
    if day_name:
        for pattern in list(_relative_patterns):
            _relative_patterns[pattern] = day_name
            instruction            = re.sub(pattern, day_name, instruction,            flags=re.IGNORECASE)
            instruction_for_logic  = re.sub(pattern, day_name, instruction_for_logic,  flags=re.IGNORECASE)

    # If the user explicitly names a concrete day in their instruction, that beats the
    # UI-selected day (e.g. "add a task on Monday" while viewing Wednesday → Monday wins).
    instruction_day = _extract_day_from_text(instruction_for_logic)
    if instruction_day:
        day_name = instruction_day
        # Re-apply substitution with the newly resolved day if it changed
        for pattern in _relative_patterns:
            instruction = re.sub(pattern, day_name, instruction, flags=re.IGNORECASE)
    Logger.info("Adjust_Plan period=%d day=%s depth=%d instruction=%s",
                period_idx, day_name, chat_depth, instruction[:80])

    # ── Call AI ────────────────────────────────────────────────────────────────
    prompt = _build_prompt(current_plan, instruction, period_idx, day_name, pinned_task, chat_depth)
    ai_unavailable = False
    try:
        raw    = _call_openrouter(prompt, temperature=0.25, max_tokens=6000)
        Logger.debug("AI raw response (%d chars): %s", len(raw), raw[:300])
        result = _safe_json(raw)
    except Exception as e:
        err_str = str(e)
        if "402" in err_str or "exhausted" in err_str.lower():
            Logger.warning("All OpenRouter API keys exhausted — running keyword fallback (add credits at openrouter.ai)")
            ai_unavailable = True
        else:
            Logger.error("AI adjuster failed: %s — using fallback", e)
        result = None

    # ── Validate & merge result ────────────────────────────────────────────────
    if result and isinstance(result, dict):
        intent        = result.get("intent", "general")
        modified_days = result.get("modified_days")  # just the days array
        chat_response = result.get("chat_response") or ""
        diff_summary  = result.get("diff_summary")  or ""
        explanation   = result.get("explanation")
        examples      = result.get("examples")

        # For explain / examples intent, do not touch the plan
        if intent in ("explain_task", "get_examples"):
            modified_days = None
            if explanation:
                chat_response = explanation
            elif examples:
                lines = []
                for i, ex in enumerate(examples[:3], 1):
                    lines.append(
                        f"Example {i}:\n"
                        f"  ✗ {ex.get('error', '')}\n"
                        f"  ✓ {ex.get('correction', '')}\n"
                        f"  💡 {ex.get('reason', '')}"
                    )
                chat_response = "\n\n".join(lines)

        # Safety net: AI said it would modify the plan but gave no days.
        # Run the keyword fallback to at least do something useful.
        MODIFYING_INTENTS = {"add_task", "remove_task", "modify_task", "general"}
        if intent in MODIFYING_INTENTS and not modified_days:
            Logger.warning(
                "AI intent=%s but modified_days is null — applying keyword fallback", intent
            )
            msg_lower = instruction_for_logic.lower()
            if any(k in msg_lower for k in ("remove", "delete", "drop")):
                fb_plan = _fallback_remove_task(current_plan, period_idx, instruction, day_name, pinned_task)
                diff    = _compute_diff(current_plan, fb_plan, period_idx)
                return {
                    "intent":        "remove_task",
                    "modified_plan": fb_plan,
                    "chat_response": chat_response or f"Done — {diff}",
                    "diff_summary":  diff,
                }
            if any(k in msg_lower for k in ("add", "new", "extra", "more", "grammar",
                                             "vocabulary", "writing", "reading")):
                fb_plan = _fallback_add_task(current_plan, period_idx, day_name, instruction)
                diff    = _compute_diff(current_plan, fb_plan, period_idx)
                return {
                    "intent":        "add_task",
                    "modified_plan": fb_plan,
                    "chat_response": chat_response or f"Done — {diff}",
                    "diff_summary":  diff,
                }

        # Merge modified_days back into a full plan copy
        modified_plan = None
        if modified_days and isinstance(modified_days, list):
            modified_plan = deepcopy(current_plan)
            periods = modified_plan.get("plan", [])
            if period_idx < len(periods):
                original_days = periods[period_idx].get("days", [])

                # LLMs often return ONLY the day(s) they changed, not the full array.
                # If modified_days has fewer days than the original, merge at day level
                # to preserve all unchanged days instead of wiping them out.
                if len(modified_days) < len(original_days):
                    modified_map = {
                        d.get("day", "").lower(): d
                        for d in modified_days
                        if d.get("day")
                    }
                    merged = []
                    seen = set()
                    for orig_day in original_days:
                        name = orig_day.get("day", "").lower()
                        seen.add(name)
                        merged.append(modified_map.get(name, orig_day))
                    # Append any brand-new days the LLM added that weren't in original
                    for d in modified_days:
                        if d.get("day", "").lower() not in seen:
                            merged.append(d)
                    periods[period_idx]["days"] = merged
                else:
                    periods[period_idx]["days"] = modified_days

                # ── remove_task: surgical removal ──────────────────────────────────
                # Don't trust the LLM's full day output — it often wipes task fields
                # or corrupts unchanged days. Instead:
                #   1. Compare original vs LLM output to find which task disappeared
                #   2. Reset ALL days back to original state
                #   3. Remove only that exact task surgically
                if intent == "remove_task":
                    # Build fingerprint of all original tasks
                    orig_task_map: dict[str, dict] = {}
                    for orig_d in original_days:
                        for t in orig_d.get("tasks", []):
                            key = t.get("task_id") or t.get("title", "").lower()
                            if key:
                                orig_task_map[key] = t

                    # Build fingerprint of tasks in LLM's output
                    llm_task_keys: set[str] = set()
                    for mod_d in periods[period_idx]["days"]:
                        for t in mod_d.get("tasks", []):
                            key = t.get("task_id") or t.get("title", "").lower()
                            if key:
                                llm_task_keys.add(key)

                    # Tasks present in original but absent in LLM output = removed by LLM
                    llm_removed_keys = set(orig_task_map.keys()) - llm_task_keys

                    # Reset every day to original state (discard LLM corruption)
                    orig_day_map_r = {d.get("day", "").lower(): d for d in original_days}
                    for d in periods[period_idx]["days"]:
                        orig = orig_day_map_r.get(d.get("day", "").lower())
                        d["tasks"] = list(orig.get("tasks", [])) if orig else []

                    # Determine the single task to remove
                    # Priority: pinned_task > LLM-identified (exactly 1) > fallback
                    task_to_remove = None
                    if pinned_task:
                        task_to_remove = pinned_task
                    elif len(llm_removed_keys) == 1:
                        key = next(iter(llm_removed_keys))
                        task_to_remove = orig_task_map.get(key)

                    if task_to_remove:
                        remove_id    = task_to_remove.get("task_id")
                        remove_title = task_to_remove.get("title", "").lower()
                        for d in periods[period_idx]["days"]:
                            d["tasks"] = [
                                t for t in d.get("tasks", [])
                                if not (
                                    (remove_id and t.get("task_id") == remove_id)
                                    or t.get("title", "").lower() == remove_title
                                )
                            ]
                    else:
                        # Ambiguous (LLM removed 0 or >1 tasks) — fall back to word-overlap
                        fb = _fallback_remove_task(
                            deepcopy(current_plan), period_idx, instruction, day_name, pinned_task
                        )
                        fb_periods = fb.get("plan", [])
                        if period_idx < len(fb_periods):
                            periods[period_idx]["days"] = fb_periods[period_idx]["days"]

                # ── add_task: harvest-and-place ────────────────────────────────────
                # LLMs reliably generate good task content but unreliably choose
                # the correct day. So we:
                #   1. Build a global fingerprint of every existing task
                #   2. Harvest any genuinely NEW tasks from ANYWHERE in the response
                #   3. Reset all days to their original state (no LLM corruption)
                #   4. Place the new tasks into the correct target_day
                #   5. If LLM gave no new task, fall back to _fallback_add_task
                if intent == "add_task":
                    # Step 1 — fingerprint of all original tasks across all days
                    all_orig_ids    = set()
                    all_orig_titles = set()
                    orig_day_map    = {}
                    for orig_d in original_days:
                        dkey = orig_d.get("day", "").lower()
                        orig_day_map[dkey] = orig_d
                        for t in orig_d.get("tasks", []):
                            if t.get("task_id"):
                                all_orig_ids.add(t["task_id"])
                            if t.get("title"):
                                all_orig_titles.add(t["title"].lower())

                    # Step 2 — harvest new tasks from ANYWHERE the LLM put them
                    harvested = []
                    for d in periods[period_idx]["days"]:
                        for t in d.get("tasks", []):
                            tid    = t.get("task_id", "")
                            ttitle = t.get("title", "").lower()
                            is_new = (
                                (not tid or tid not in all_orig_ids)
                                and ttitle not in all_orig_titles
                                and t.get("title")        # must have a title
                            )
                            if is_new:
                                harvested.append(t)

                    # Step 3 — reset all days to their original state
                    for d in periods[period_idx]["days"]:
                        orig = orig_day_map.get(d.get("day", "").lower())
                        d["tasks"] = list(orig.get("tasks", [])) if orig else []

                    # Step 4 — place harvested tasks into target_day
                    placed = False
                    if harvested and day_name:
                        for d in periods[period_idx]["days"]:
                            if d.get("day", "").lower() == day_name.lower():
                                d["tasks"] = d.get("tasks", []) + harvested
                                placed = True
                                break

                    # Step 5 — LLM gave nothing new: use deterministic fallback
                    if not placed:
                        Logger.warning(
                            "add_task: LLM produced no new task for day=%s — using fallback", day_name
                        )
                        fb = _fallback_add_task(deepcopy(current_plan), period_idx, day_name, instruction)
                        fb_periods = fb.get("plan", [])
                        if period_idx < len(fb_periods):
                            periods[period_idx]["days"] = fb_periods[period_idx]["days"]

            if not diff_summary:
                diff_summary = _compute_diff(current_plan, modified_plan, period_idx)

        if not chat_response:
            chat_response = diff_summary or "Plan updated."

        return {
            "intent":        intent,
            "modified_plan": modified_plan,
            "chat_response": chat_response,
            "diff_summary":  diff_summary,
            "explanation":   explanation,
            "examples":      examples,
        }

    # ── Fallback (AI failed entirely) ──────────────────────────────────────────
    if not ai_unavailable:
        Logger.warning("AI adjuster returned no valid result — using keyword fallback")
    msg_lower = instruction_for_logic.lower()

    _note = " (using basic mode — AI credits exhausted)" if ai_unavailable else ""

    if any(k in msg_lower for k in ("remove", "delete", "drop")):
        updated = _fallback_remove_task(current_plan, period_idx, instruction, day_name, pinned_task)
        diff    = _compute_diff(current_plan, updated, period_idx)
        return {
            "intent":        "remove_task",
            "modified_plan": updated,
            "chat_response": f"Done — {diff}{_note}",
            "diff_summary":  diff,
        }

    if any(k in msg_lower for k in ("add", "new", "extra", "more", "grammar",
                                     "grammer", "vocabulary", "vocab", "writing",
                                     "reading", "punctuat")):
        updated = _fallback_add_task(current_plan, period_idx, day_name, instruction)
        diff    = _compute_diff(current_plan, updated, period_idx)
        return {
            "intent":        "add_task",
            "modified_plan": updated,
            "chat_response": f"Done — {diff}{_note}",
            "diff_summary":  diff,
        }

    # Nothing matched
    return {
        "intent":        "general",
        "modified_plan": None,
        "chat_response": (
            "AI credits are exhausted — basic mode can only add or remove tasks. "
            "Please top up your OpenRouter account."
            if ai_unavailable else
            "I couldn't process that request right now. Please try rephrasing."
        ),
        "diff_summary":  "",
    }
