import os
import re
import json
import random
import logging
import threading
from datetime import datetime, timedelta
from pathlib import Path
from urllib import request, error

from pymongo import MongoClient
from Classification.models import Classification_Level
from Feedback.models import Feedback_Result

Logger = logging.getLogger(__name__)

# ── EFCAMDAT question bank ────────────────────────────────────────────────────
_BANK_PATH = Path(__file__).parent.parent.parent / "data" / "question_bank.json"
_EFCAMDAT_BANK: dict = {}
try:
    with open(_BANK_PATH, encoding="utf-8") as _f:
        _EFCAMDAT_BANK = json.load(_f)
    Logger.info("Plan_Generator: loaded EFCAMDAT bank %s", {k: len(v) for k, v in _EFCAMDAT_BANK.items()})
except Exception as _e:
    Logger.warning("Plan_Generator: could not load EFCAMDAT bank: %s", _e)

# ── Rules databases (grammar / vocab / punctuation) ───────────────────────────
_DATA_DIR = Path(__file__).parent.parent.parent / "data"

def _load_rules(filename):
    try:
        with open(_DATA_DIR / filename, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        Logger.warning("Plan_Generator: could not load %s: %s", filename, e)
        return []

_GRAMMAR_RULES: list = _load_rules("grammar_rules.json")
_VOCAB_RULES:   list = _load_rules("vocab_rules.json")
_PUNCT_RULES:   list = _load_rules("punctuation_rules.json")

_RULES_BY_SKILL = {
    "grammar":     _GRAMMAR_RULES,
    "vocabulary":  _VOCAB_RULES,
    "punctuation": _PUNCT_RULES,
}

Logger.info(
    "Plan_Generator: rules loaded — grammar:%d vocab:%d punct:%d",
    len(_GRAMMAR_RULES), len(_VOCAB_RULES), len(_PUNCT_RULES),
)

_CEFR_LEVEL_ORDER = {"A1": 0, "A2": 1, "B1": 2, "B2": 3, "C1": 4, "C2": 5}


def _pick_rule(skill: str, level: str) -> dict | None:
    """Pick a random rule entry matching the skill and CEFR level."""
    pool = _RULES_BY_SKILL.get(skill, _GRAMMAR_RULES)
    if not pool:
        return None

    level_idx = _CEFR_LEVEL_ORDER.get(level.upper(), 2)

    # Prefer rules whose cefr_levels list includes this level or adjacent levels
    def score(r):
        lvls = r.get("cefr_levels", [])
        if level in lvls:
            return 2
        # Accept rules within 1 CEFR band
        for lv in lvls:
            if abs(_CEFR_LEVEL_ORDER.get(lv, 2) - level_idx) <= 1:
                return 1
        return 0

    # Filter: must have example_error (skip explanation-only entries for vocab)
    candidates = [r for r in pool if r.get("example_error", "").strip() and score(r) > 0]
    if not candidates:
        candidates = [r for r in pool if r.get("example_error", "").strip()]
    if not candidates:
        return None

    return random.choice(candidates)


def _explanation_for_level(rule: dict, level: str) -> str:
    """Return the most appropriate explanation string for this CEFR level."""
    level_upper = level.upper()
    if level_upper in ("A1", "A2"):
        return rule.get("explanation_A1") or rule.get("explanation_B1") or rule.get("rule", "")
    if level_upper in ("B1", "B2"):
        return rule.get("explanation_B1") or rule.get("rule", "")
    return rule.get("explanation_C1") or rule.get("explanation_B1") or rule.get("rule", "")


def _enrich_tasks_with_rules(plan: dict, level: str) -> dict:
    """
    For every task in the plan, pick a matching grammar/vocab/punctuation rule
    and inject explanation, example_error, example_correction, correction_reason.
    Tasks that already have these fields (AI-generated) are left unchanged.
    """
    used_rule_numbers = set()

    for period in plan.get("plan", []):
        for day in period.get("days", []):
            for task in day.get("tasks", []):
                # Skip only when all four fields are present and look specific
                # (not just non-empty — the LLM sometimes produces generic boilerplate)
                _GENERIC_PHRASES = (
                    "this task focuses on",
                    "pay attention to accuracy",
                    "applying",
                    "rules correctly makes",
                    "each sentence you write",
                )
                def _looks_generic(text: str) -> bool:
                    t = (text or "").strip().lower()
                    return not t or any(p in t for p in _GENERIC_PHRASES)

                if (task.get("explanation") and task.get("example_error")
                        and task.get("example_correction") and task.get("correction_reason")
                        and not _looks_generic(task["explanation"])
                        and not _looks_generic(task["correction_reason"])):
                    continue

                # Determine which skill to pick a rule for
                task_skills = task.get("skills", [])
                skill = None
                for s in ("grammar", "punctuation", "vocabulary"):
                    if s in task_skills:
                        skill = s
                        break
                if not skill:
                    skill = random.choice(["grammar", "punctuation", "vocabulary"])

                # Pick a rule not already used in this plan
                rule = None
                for _ in range(8):
                    candidate = _pick_rule(skill, level)
                    if candidate is None:
                        break
                    rn = candidate.get("rule_number") or id(candidate)
                    if rn not in used_rule_numbers:
                        rule = candidate
                        used_rule_numbers.add(rn)
                        break
                if rule is None:
                    rule = _pick_rule(skill, level)  # accept duplicate if no unique left

                if rule:
                    task["explanation"]       = _explanation_for_level(rule, level)
                    task["example_error"]     = rule.get("example_error", "")
                    task["example_correction"]= rule.get("example_correction", "")
                    task["correction_reason"] = rule.get("correction_reason", "")
                else:
                    task.setdefault("explanation", "")
                    task.setdefault("example_error", "")
                    task.setdefault("example_correction", "")
                    task.setdefault("correction_reason", "")

    return plan


def _efcamdat_prompts_for_level(level: str, skill_focus: str = None, task_type: str = None, limit: int = 8) -> list:
    """Return EFCAMDAT writing prompts relevant to this level and optional filters."""
    bucket = {"A1": ["A1", "A2"], "A2": ["A1", "A2"], "B1": ["B1", "B2"], "B2": ["B1", "B2"]}.get(level, ["B1", "B2"])
    results = []
    for lv in bucket:
        for entry in _EFCAMDAT_BANK.get(lv, []):
            if task_type and entry["task_type"] != task_type:
                continue
            if skill_focus and entry["skill_focus"] not in (skill_focus, "general"):
                continue
            results.append(entry["prompt"])
    random.shuffle(results)
    return results[:limit]

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


def _normalize_level(level):
    level = (level or "A1").upper()
    return level if level in LEVELS else "A1"


def _get_latest_level_row(user_id):
    return (
        Classification_Level.objects
        .filter(User_Id=user_id)
        .order_by("-Created_At")
        .first()
    )


def _get_latest_level(user_id):
    row = _get_latest_level_row(user_id)
    if not row:
        return "A1"
    return _normalize_level(row.Level)


def _get_latest_feedback_row(user_id):
    return (
        Feedback_Result.objects
        .filter(User_Id=user_id)
        .order_by("-Created_At")
        .first()
    )


def _get_feedback_profile(user_id):
    profile = {
        "weak_skills": [],
        "avg_scores": {"grammar": 0, "vocab": 0, "punct": 0},
        "issues": [],
        "recent_issues": [],
    }

    rows = (
        Feedback_Result.objects
        .filter(User_Id=user_id)
        .order_by("-Created_At")[:12]
    )
    if not rows:
        return profile

    weights = []
    for idx, _ in enumerate(rows):
        # Exponential decay: most recent has highest weight
        weights.append(0.8 ** idx)

    g = [float(r.Grammar_Score or 0) for r in rows]
    v = [float(r.Vocab_Score or 0) for r in rows]
    p = [float(r.Punct_Score or 0) for r in rows]

    total_w = sum(weights) if weights else 1
    profile["avg_scores"]["grammar"] = sum(g[i] * weights[i] for i in range(len(g))) / total_w
    profile["avg_scores"]["vocab"] = sum(v[i] * weights[i] for i in range(len(v))) / total_w
    profile["avg_scores"]["punct"] = sum(p[i] * weights[i] for i in range(len(p))) / total_w

    if profile["avg_scores"]["grammar"] < 65:
        profile["weak_skills"].append("grammar")
    if profile["avg_scores"]["vocab"] < 65:
        profile["weak_skills"].append("vocabulary")
    if profile["avg_scores"]["punct"] < 65:
        profile["weak_skills"].append("punctuation")

    for r in rows:
        if isinstance(r.Detected_Issues, list):
            profile["issues"].extend(r.Detected_Issues)

    recent_issues = []
    for r in rows[:4]:
        if isinstance(r.Detected_Issues, list):
            recent_issues.extend(r.Detected_Issues)
    profile["recent_issues"] = recent_issues

    # Also derive weak skills from Detected_Issues strings (e.g. "grammar error",
    # "vocabulary repetition") so the plan reflects real-time detections even when
    # the numeric scores happen to be above the 65-threshold.
    _skill_keywords = {
        "grammar":     ["grammar"],
        "vocabulary":  ["vocabulary", "vocab", "word choice", "lexical"],
        "punctuation": ["punctuation", "punct", "comma", "apostrophe"],
        "spelling":    ["spelling", "spell"],
    }
    all_issue_text = " ".join(
        i.lower() for i in profile.get("issues", []) if isinstance(i, str)
    )
    for skill, keywords in _skill_keywords.items():
        target = "vocabulary" if skill == "spelling" else skill  # map spelling → vocabulary bucket
        if target not in profile["weak_skills"]:
            if any(kw in all_issue_text for kw in keywords):
                profile["weak_skills"].append(target)

    return profile


# ── Module-level singletons (loaded once, reused on every call) ───────────────
_EMBED_MODEL = None
_EMBED_LOCK  = threading.Lock()

def _get_embed_model():
    global _EMBED_MODEL
    if _EMBED_MODEL is None:
        with _EMBED_LOCK:
            if _EMBED_MODEL is None:
                from sentence_transformers import SentenceTransformer
                model_name = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
                Logger.info("Loading embedding model %s (once)…", model_name)
                _EMBED_MODEL = SentenceTransformer(model_name)
    return _EMBED_MODEL

_MONGO_CLIENT = None
_MONGO_LOCK   = threading.Lock()

def _get_mongo_client():
    global _MONGO_CLIENT
    if _MONGO_CLIENT is None:
        with _MONGO_LOCK:
            if _MONGO_CLIENT is None:
                mongo_uri = os.getenv("MONGODB_URI") or os.getenv("MONGO_URL")
                if not mongo_uri:
                    raise RuntimeError("MongoDB URI not configured")
                Logger.info("Creating MongoDB client singleton…")
                _MONGO_CLIENT = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
    return _MONGO_CLIENT


def _embed_text(text):
    return _get_embed_model().encode(text).tolist()


def _atlas_vector_search(query_text, cefr_levels, top_k=12):
    try:
        client = _get_mongo_client()
    except RuntimeError as e:
        Logger.warning("MongoDB unavailable: %s", e)
        return []

    db_name = os.getenv("MONGODB_DB", "Rag")
    collection_name = os.getenv("RAG_COLLECTION", "Chunks")
    index_name = os.getenv("RAG_VECTOR_INDEX", "rag_vector_index")

    try:
        coll = client[db_name][collection_name]
        query_vector = _embed_text(query_text)

        pipeline = [
            {
                "$vectorSearch": {
                    "index": index_name,
                    "path": "embedding",
                    "queryVector": query_vector,
                    "numCandidates": 200,
                    "limit": top_k,
                    "filter": {"cefr_level": {"$in": cefr_levels}},
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "id": 1,
                    "text": 1,
                    "chunk_type": 1,
                    "skill": 1,
                    "source": 1,
                    "title": 1,
                    "url": 1,
                    "cefr_level": 1,
                    "score": {"$meta": "vectorSearchScore"},
                }
            },
        ]

        return list(coll.aggregate(pipeline))
    except Exception as e:
        Logger.error(f"Vector search failed: {e}")
        return []


def _truncate_chunk_text(text, limit=600):
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def _build_pref_block(pref_context):
    """Build a preferences block to inject into prompts."""
    if not pref_context:
        return ""
    lines = []
    if pref_context.get("user_goal"):
        lines.append(f"- Learning goal: {pref_context['user_goal']}")
    intensity_labels = {"light": "Light (1 task/day)", "normal": "Normal (2 tasks/day)", "intensive": "Intensive (3 tasks/day)"}
    intensity = pref_context.get("intensity", "normal")
    lines.append(f"- Study intensity: {intensity_labels.get(intensity, intensity)}")
    lines.append(f"- Session duration: ~{pref_context.get('session_minutes', 40)} minutes per task")
    avail = pref_context.get("available_days", [])
    if avail:
        lines.append(
            f"- STUDY DAYS (HARD CONSTRAINT): {', '.join(avail)} ONLY. "
            f"All other days MUST have an empty tasks list: []"
        )
    if not lines:
        return ""
    return "\n**USER PREFERENCES (strictly respect these):**\n" + "\n".join(lines) + "\n"


# Full day name → short abbreviation mapping (matches questionnaire DAYS array)
_DAY_ABBREV = {
    "sunday": "Sun", "monday": "Mon", "tuesday": "Tue",
    "wednesday": "Wed", "thursday": "Thu", "friday": "Fri", "saturday": "Sat",
}
_ABBREV_TO_FULL = {v: k.capitalize() for k, v in _DAY_ABBREV.items()}


def _normalize_day(d: str) -> str:
    """
    Normalise any day representation to a lowercase 3-letter abbreviation.
    Handles full names ('Monday', 'monday'), abbreviations ('Mon', 'mon'),
    and anything in between so comparisons are consistent.
    """
    d = (d or "").strip()
    d_low = d.lower()
    # Full name like 'monday' → look up in _DAY_ABBREV → 'Mon' → 'mon'
    if d_low in _DAY_ABBREV:
        return _DAY_ABBREV[d_low].lower()
    # Abbreviation like 'Mon', 'mon' → capitalise first 3 chars → check _ABBREV_TO_FULL
    abbrev = d[:3].capitalize()
    if abbrev in _ABBREV_TO_FULL:
        return abbrev.lower()
    # Unknown — just return first 3 lowercase chars
    return d_low[:3]


def _enforce_available_days(plan_periods: list, available_days: list) -> list:
    """
    Post-processing hard enforcement: remove tasks from any day not in available_days.
    Runs after AI generation so the constraint is guaranteed regardless of model compliance.
    available_days is the raw list from the questionnaire e.g. ['Mon', 'Wed', 'Fri'].
    """
    if not available_days:
        return plan_periods  # no constraint — keep all days

    # Build allowed set using consistent 3-letter lowercase keys
    allowed = {_normalize_day(d) for d in available_days}

    for period in plan_periods:
        for day_obj in period.get("days", []):
            day_name = day_obj.get("day") or ""
            if _normalize_day(day_name) not in allowed:
                day_obj["tasks"] = []

    return plan_periods


_SKILL_TASK_REQUIREMENTS = {
    "grammar": (
        "At least one task per day must ask the learner to apply a specific grammar structure "
        "(e.g., past perfect, conditional, passive voice, relative clauses). "
        "Name the target structure explicitly in the task prompt."
    ),
    "vocabulary": (
        "At least one task per day must require varied and precise vocabulary. "
        "Ask learners to 'use at least five different adjectives', 'avoid repeating the same verb', "
        "or 'choose specific descriptive words for the topic'."
    ),
    "punctuation": (
        "At least one task per day must be a formal writing task (email, letter, report) "
        "where correct punctuation — commas, apostrophes, full stops, colons — is critical. "
        "Mention this explicitly: 'pay attention to punctuation and formal register'."
    ),
}


def _build_skill_block(weak_skills: list) -> str:
    lines = []
    for skill in weak_skills:
        rule = _SKILL_TASK_REQUIREMENTS.get(skill)
        if rule:
            lines.append(f"[{skill.upper()} REQUIREMENT] {rule}")
    return ("\n\nSKILL-SPECIFIC TASK REQUIREMENTS:\n" + "\n".join(lines)) if lines else ""


def _build_efcamdat_block(level: str, weak_skills: list) -> str:
    """Build a topic-inspiration block from the EFCAMDAT bank."""
    examples = []
    for skill in (weak_skills or []):
        skill_examples = _efcamdat_prompts_for_level(level, skill_focus=skill, limit=3)
        examples.extend(skill_examples)
    if not examples:
        examples = _efcamdat_prompts_for_level(level, limit=5)
    if not examples:
        return ""
    lines = "\n".join(f"  - {e}" for e in examples[:6])
    return f"\n\nREAL-WORLD WRITING TOPIC EXAMPLES (use as style inspiration, do NOT copy verbatim):\n{lines}"


def _build_issue_block(feedback_profile: dict) -> str:
    """Format the user's real detected issue strings for injection into the AI prompt."""
    issues = list(dict.fromkeys(
        i for i in (feedback_profile.get("recent_issues") or []) if isinstance(i, str)
    ))[:8]
    if not issues:
        return ""
    lines = "\n".join(f"  - {i}" for i in issues)
    return f"\n\nUSER'S ACTUAL DETECTED ERRORS (use these to write realistic example_error sentences):\n{lines}"


def _explanation_instructions(level: str) -> str:
    if level in ("A1", "A2"):
        return (
            "Write explanation in very simple English (A1/A2 level). "
            "Use short sentences. Avoid grammar terms — say 'action word' not 'verb', "
            "'joining word' not 'conjunction'. Maximum 2 sentences."
        )
    if level in ("B1", "B2"):
        return (
            "Write explanation in clear intermediate English (B1/B2 level). "
            "You may use basic grammar terms (verb, subject, tense). "
            "Give the rule in 2-3 sentences."
        )
    return (
        "Write explanation in precise academic English (C1/C2 level). "
        "Use correct grammatical terminology. State the underlying rule concisely in 1-2 sentences."
    )


def _build_prompt(level, mode, feedback_profile, retrieved_chunks, pref_context=None):
    """Build prompt for a single-week (weekly) plan."""
    chunk_block = ""
    for i, c in enumerate(retrieved_chunks[:6], start=1):
        chunk_block += (
            f"[CHUNK {i} | {c.get('chunk_type', 'general')} | {c.get('source', 'material')} | {c.get('cefr_level', level)}]\n"
            f"{_truncate_chunk_text(c.get('text', ''))}\n---\n"
        )

    weak_skills = feedback_profile.get("weak_skills", ["writing"])
    weak_skills_str = ", ".join(weak_skills) if weak_skills else "general writing"
    tasks_per_day = (pref_context or {}).get("tasks_per_day", 2)
    pref_block = _build_pref_block(pref_context)
    skill_block = _build_skill_block(weak_skills)
    efcamdat_block = _build_efcamdat_block(level, weak_skills)
    issue_block = _build_issue_block(feedback_profile)
    expl_instr = _explanation_instructions(level)

    avail_days = (pref_context or {}).get("available_days", [])
    all_week   = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    if avail_days:
        avail_full  = [_ABBREV_TO_FULL.get(d, d) for d in avail_days]
        active_days = [d for d in all_week if d in avail_full]
        rest_days   = [d for d in all_week if d not in avail_full]
        days_instruction = (
            f"Generate tasks ONLY for these days: {', '.join(active_days)}.\n"
            f"Days with NO tasks (empty list): {', '.join(rest_days) if rest_days else 'none'}.\n"
            f"**CRITICAL: For each ACTIVE day create {tasks_per_day}-{tasks_per_day + 1} tasks. "
            f"For REST days the tasks array MUST be [].**"
        )
    else:
        active_days = all_week
        days_instruction = (
            f"Generate a weekly study plan with exactly 7 days (Sunday to Saturday).\n"
            f"**CRITICAL: For each day, create {tasks_per_day}-{tasks_per_day + 1} writing tasks appropriate for CEFR {level} level.**"
        )

    return f"""You are a CEFR-aligned English writing tutor. Return STRICT JSON only.

Student level: {level}
Mode: {mode}
Focus skills: {weak_skills_str}
{pref_block}{skill_block}{efcamdat_block}{issue_block}

{days_instruction}

TASK QUALITY RULES:
- Every task prompt must be specific, concrete, and clearly describe what the learner should write.
- No two task prompts may be near-duplicates of each other across the entire plan.
- Do not use multiple-choice or fill-in-the-blank formats — all tasks must be open writing tasks.
- Vary the writing genre each day: mix personal narratives, formal texts, opinion pieces, and reflective writing.

LEARN-PHASE FIELDS — every task MUST include all four (they must be consistent with each other):
- explanation: Name the SPECIFIC grammar/punctuation/vocabulary rule this task targets. {expl_instr}
  FORBIDDEN: "This task focuses on...", "Pay attention to...", any generic opener.
  REQUIRED: Start with the rule name. Example: "Countable nouns need a plural -s when they refer to more than one thing. 'Soap opera' is countable, so its plural is 'soap operas'."
- example_error: A realistic sentence showing the EXACT mistake that explanation describes. Must be a complete sentence with a real learner-style error.
- example_correction: The SAME sentence with ONLY that specific mistake fixed. Do not change anything else.
- correction_reason: Explain WHY the correction works by referencing the SPECIFIC words that changed between example_error and example_correction. Quote them directly.
  FORBIDDEN: "Applying X rules makes your writing clearer.", any generic closer.
  REQUIRED: Quote the change. Example: "'soap opera' → 'soap operas': countable nouns take -s in the plural. Similarly 'de' → 'the': determiners must agree with English article rules."

Each task MUST have ALL these fields:
- task_id: unique ID like "sun_task_1", "mon_task_1", etc.
- title: Short descriptive title (max 15 words)
- prompt: Detailed writing prompt (50-100 words) that asks the student to write something
- type: "writing_task"
- estimated_minutes: Integer between 15 and 60
- skills: List of skills this task targets (e.g., ["grammar", "punctuation"])
- explanation: (see above)
- example_error: (see above)
- example_correction: (see above)
- correction_reason: (see above)
- materials: List of materials, each with title, url, source

Return a JSON object with this exact structure:
{{
  "user_id": "placeholder",
  "cefr_level": "{level}",
  "mode": "{mode}",
  "focus_skills": {weak_skills},
  "generated_at": "2024-01-01T00:00:00Z",
  "starts_at": "2024-01-01T00:00:00Z",
  "ends_at": "2024-01-08T00:00:00Z",
  "current_period_index": 0,
  "plan": [
    {{
      "period": "Week 1",
      "days": [
        {{"day": "Sunday", "tasks": [{", ".join(f"TASK_OBJECT_{i+1}" for i in range(tasks_per_day))}]}},
        {{"day": "Monday", "tasks": [{", ".join(f"TASK_OBJECT_{i+1}" for i in range(tasks_per_day))}]}},
        {{"day": "Tuesday", "tasks": [{", ".join(f"TASK_OBJECT_{i+1}" for i in range(tasks_per_day))}]}},
        {{"day": "Wednesday", "tasks": [{", ".join(f"TASK_OBJECT_{i+1}" for i in range(tasks_per_day))}]}},
        {{"day": "Thursday", "tasks": [{", ".join(f"TASK_OBJECT_{i+1}" for i in range(tasks_per_day))}]}},
        {{"day": "Friday", "tasks": [{", ".join(f"TASK_OBJECT_{i+1}" for i in range(tasks_per_day))}]}},
        {{"day": "Saturday", "tasks": [{", ".join(f"TASK_OBJECT_{i+1}" for i in range(tasks_per_day))}]}}
      ]
    }}
  ]
}}

**IMPORTANT**:
- ONLY the ACTIVE days listed above get tasks. REST days MUST have tasks: []
- Use the material chunks below for inspiration but create original tasks
- Keep tasks appropriate for {level} level learners

Educational material for inspiration:
{chunk_block}

Return ONLY the JSON object, no other text, no markdown."""


def _extract_used_titles(periods):
    """Return a flat list of all task titles already generated in previous weeks."""
    titles = []
    for period in periods:
        for day in period.get("days", []):
            for task in day.get("tasks", []):
                t = (task.get("title") or "").strip()
                if t:
                    titles.append(t)
    return titles


def _build_week_prompt(level, feedback_profile, retrieved_chunks, week_num, total_weeks, used_titles=None, pref_context=None):
    """Build a prompt that generates a single week period for a monthly plan."""
    chunk_block = ""
    for i, c in enumerate(retrieved_chunks[:6], start=1):
        chunk_block += (
            f"[CHUNK {i} | {c.get('chunk_type', 'general')} | {c.get('source', 'material')} | {c.get('cefr_level', level)}]\n"
            f"{_truncate_chunk_text(c.get('text', ''))}\n---\n"
        )

    weak_skills = feedback_profile.get("weak_skills", ["writing"])
    weak_skills_str = ", ".join(weak_skills) if weak_skills else "general writing"
    tasks_per_day = (pref_context or {}).get("tasks_per_day", 2)
    pref_block = _build_pref_block(pref_context)
    prefix = f"w{week_num}"

    if week_num == 1:
        progression = "Introduce the core concepts and build foundational skills."
    elif week_num == total_weeks:
        progression = "Consolidate and review all skills covered in previous weeks. Integrate everything learned."
    else:
        progression = f"Build on Week {week_num - 1} — increase complexity, introduce new task formats, and vary the skill focus."

    # Exclusion block: tell the AI which task titles have already been used
    exclusion_block = ""
    if used_titles:
        titles_list = "\n".join(f"  - {t}" for t in used_titles[:40])
        exclusion_block = f"""
**ALREADY USED IN PREVIOUS WEEKS — DO NOT REPEAT THESE TASKS:**
{titles_list}

You MUST create completely different tasks with different titles, formats, and writing prompts.
"""

    skill_block = _build_skill_block(weak_skills)
    efcamdat_block = _build_efcamdat_block(level, weak_skills)
    issue_block = _build_issue_block(feedback_profile)
    expl_instr = _explanation_instructions(level)

    avail_days  = (pref_context or {}).get("available_days", [])
    all_week    = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    if avail_days:
        avail_full  = [_ABBREV_TO_FULL.get(d, d) for d in avail_days]
        active_days = [d for d in all_week if d in avail_full]
        rest_days   = [d for d in all_week if d not in avail_full]
        days_instruction = (
            f"Generate ONLY Week {week_num} with all 7 days present in the JSON, "
            f"but tasks ONLY for: {', '.join(active_days)}.\n"
            f"Days with NO tasks (empty list []): {', '.join(rest_days) if rest_days else 'none'}.\n"
            f"**CRITICAL: For each ACTIVE day create {tasks_per_day}-{tasks_per_day + 1} tasks. "
            f"For REST days the tasks array MUST be [].**"
        )
    else:
        days_instruction = (
            f"Generate ONLY Week {week_num} covering exactly 7 days (Sunday to Saturday).\n"
            f"**CRITICAL: For each day, create {tasks_per_day}-{tasks_per_day + 1} writing tasks appropriate for CEFR {level} level.**"
        )

    return f"""You are a CEFR-aligned English writing tutor. Return STRICT JSON only.

Student level: {level}
Monthly plan — generating Week {week_num} of {total_weeks}
Focus skills: {weak_skills_str}
Progression note: {progression}
{pref_block}{skill_block}{efcamdat_block}{issue_block}
{exclusion_block}
{days_instruction}

TASK QUALITY RULES:
- Every task prompt must be specific, concrete, and clearly describe what the learner should write.
- No two task prompts may be near-duplicates of each other across this week.
- Do not use multiple-choice or fill-in-the-blank formats — all tasks must be open writing tasks.
- Vary the writing genre each day: mix personal narratives, formal texts, opinion pieces, and reflective writing.

LEARN-PHASE FIELDS — every task MUST include all four (they must be consistent with each other):
- explanation: Name the SPECIFIC grammar/punctuation/vocabulary rule this task targets. {expl_instr}
  FORBIDDEN: "This task focuses on...", "Pay attention to...", any generic opener.
  REQUIRED: Start with the rule name. Example: "Subject-verb agreement: a singular subject takes a singular verb. 'He go' is wrong — it must be 'He goes'."
- example_error: A realistic complete sentence showing the EXACT mistake that explanation describes.
- example_correction: The SAME sentence with ONLY that specific mistake fixed.
- correction_reason: Explain WHY the correction works by quoting the SPECIFIC words that changed.
  FORBIDDEN: "Applying X rules makes your writing clearer.", any generic closer.
  REQUIRED: Quote the change. Example: "'go' → 'goes': third-person singular present tense verbs take the -s suffix in English."

Each task MUST have ALL these fields:
- task_id: unique ID prefixed with "{prefix}_" e.g. "{prefix}_sun_task_1", "{prefix}_mon_task_1"
- title: Short descriptive title (max 15 words)
- prompt: Detailed writing prompt (50-100 words) that asks the student to write something
- type: "writing_task"
- estimated_minutes: Integer between 15 and 60
- skills: List of skills this task targets (e.g., ["grammar", "punctuation"])
- explanation: (see above)
- example_error: (see above)
- example_correction: (see above)
- correction_reason: (see above)
- materials: List of materials, each with title, url, source

Return a JSON object with this exact structure (a single period — do NOT wrap in a plan array):
{{
  "period": "Week {week_num}",
  "days": [
    {{"day": "Sunday",    "tasks": [{", ".join(f"TASK_OBJECT_{i+1}" for i in range(tasks_per_day))}]}},
    {{"day": "Monday",    "tasks": [{", ".join(f"TASK_OBJECT_{i+1}" for i in range(tasks_per_day))}]}},
    {{"day": "Tuesday",   "tasks": [{", ".join(f"TASK_OBJECT_{i+1}" for i in range(tasks_per_day))}]}},
    {{"day": "Wednesday", "tasks": [{", ".join(f"TASK_OBJECT_{i+1}" for i in range(tasks_per_day))}]}},
    {{"day": "Thursday",  "tasks": [{", ".join(f"TASK_OBJECT_{i+1}" for i in range(tasks_per_day))}]}},
    {{"day": "Friday",    "tasks": [{", ".join(f"TASK_OBJECT_{i+1}" for i in range(tasks_per_day))}]}},
    {{"day": "Saturday",  "tasks": [{", ".join(f"TASK_OBJECT_{i+1}" for i in range(tasks_per_day))}]}}
  ]
}}

**IMPORTANT**:
- ONLY the ACTIVE days listed above get tasks. REST days MUST have tasks: []
- Use the material chunks below for inspiration but create original tasks
- Keep tasks appropriate for {level} level learners
- Every task title and prompt must be unique and different from previous weeks

Educational material for inspiration:
{chunk_block}

Return ONLY the JSON object for this single week period, no other text, no markdown."""


def _get_openrouter_keys():
    """Return all configured API keys in order, skipping blanks (supports up to 8 keys)."""
    keys = []
    for suffix in ("", "_2", "_3", "_4", "_5", "_6", "_7", "_8"):
        k = os.getenv(f"OPENROUTER_API_KEY{suffix}", "").strip()
        if k:
            keys.append(k)
    return keys


def _call_openrouter(prompt, model_override=None):
    base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    model = model_override or os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash")
    free_model = os.getenv("OPENROUTER_FREE_MODEL", "openai/gpt-oss-120b:free")
    referer = os.getenv("OPENROUTER_HTTP_REFERER", "http://localhost:8000")
    app_name = os.getenv("OPENROUTER_APP_NAME", "EWC-AI-Backend")

    api_keys = _get_openrouter_keys()
    if not api_keys:
        raise ValueError("No OPENROUTER_API_KEY configured")

    def _make_body(mdl):
        return {
            "model": mdl,
            "messages": [
                {"role": "system", "content": "Return strict JSON only. No markdown. No extra text outside the JSON object."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.4,
            "max_tokens": 8000,
        }

    def _try_key(api_key, mdl):
        req = request.Request(
            url=f"{base_url}/chat/completions",
            data=json.dumps(_make_body(mdl)).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": referer,
                "X-Title": app_name,
            },
            method="POST",
        )
        with request.urlopen(req, timeout=90) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        return payload["choices"][0]["message"]["content"]

    last_err = None
    max_retries = len(api_keys)  # try every available key before giving up

    # Build model list: paid first, then free, then built-in fallbacks
    _builtin_fallbacks = [
        "openai/gpt-4o-mini",
        "openai/gpt-oss-120b:free",
        "google/gemini-2.5-flash",
        "nvidia/nemotron-3-super-120b-a12b:free",
    ]
    models_to_try = [m for m in [model, free_model] + _builtin_fallbacks if m]
    # Deduplicate while preserving order
    seen = set()
    models_to_try = [m for m in models_to_try if not (m in seen or seen.add(m))]

    for mdl in models_to_try:
        mdl_exhausted = True
        for idx, api_key in enumerate(api_keys[:max_retries], 1):
            try:
                result = _try_key(api_key, mdl)
                Logger.info("Request succeeded with model: %s", mdl)
                return result
            except error.HTTPError as e:
                if e.code in (402, 429):
                    Logger.warning("Model %s key #%d exhausted (HTTP %d), trying next key", mdl, idx, e.code)
                    last_err = e
                    continue
                if e.code in (400, 404):
                    # 404 = model removed; 400 = model rejected request (wrong ID, no free tier, etc.)
                    Logger.warning("Model %s returned HTTP %d, skipping to next model", mdl, e.code)
                    last_err = e
                    break  # break inner key loop, move to next model
                mdl_exhausted = False
                raise
        if not mdl_exhausted:
            break
        Logger.warning("All keys exhausted for model %s, trying next model", mdl)

    raise last_err or RuntimeError("All models and API keys exhausted")


def generate_task_learn_fields(example_error: str, example_correction: str, skills: list, level: str = "B1") -> dict:
    """
    Given an error/correction pair, ask the LLM to produce a specific explanation
    and correction_reason for the ExamplesModal "About This Task" section.
    Returns {"explanation": str, "correction_reason": str} or raises on failure.
    """
    skills_str = ", ".join(skills) if skills else "grammar"
    prompt = f"""You are a CEFR-aligned English writing tutor. A student is looking at this example:

Common Mistake: {example_error}
Corrected:      {example_correction}
Skills targeted: {skills_str}
Student CEFR level: {level}

Return a JSON object with exactly two keys:
- "explanation": Name the SPECIFIC grammar/punctuation/vocabulary rule that this example demonstrates. Start with the rule name directly. Use clear {level}-level English. 2-3 sentences max. FORBIDDEN: "This task focuses on…", "Pay attention to…"
- "correction_reason": Explain WHY the correction is right by quoting the SPECIFIC words/phrases that changed. Use arrows: 'wrong' → 'correct'. Explain the underlying rule for each change. FORBIDDEN: "Applying X rules makes your writing clearer."

Return ONLY the JSON object, no markdown, no extra text.
Example output format:
{{"explanation": "...", "correction_reason": "..."}}"""

    raw = _call_openrouter(prompt)
    cleaned = _repair_json_object(raw) if raw else ""
    result = json.loads(cleaned)
    return {
        "explanation":       str(result.get("explanation", "")).strip(),
        "correction_reason": str(result.get("correction_reason", "")).strip(),
    }


def _repair_json_object(text):
    candidate = (text or "").strip()

    # Remove markdown code blocks
    if candidate.startswith("```"):
        candidate = candidate.strip("`")
        if "\n" in candidate:
            candidate = candidate.split("\n", 1)[1]
        if candidate.endswith("```"):
            candidate = candidate[:-3]

    # Extract JSON object
    left = candidate.find("{")
    right = candidate.rfind("}")
    if left != -1 and right != -1 and right > left:
        candidate = candidate[left:right + 1]

    # Clean quotes
    candidate = candidate.replace("“", "\"").replace("”", "\"").replace("’", "'").replace("‘", "'")
    candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
    
    # Remove trailing commas
    candidate = re.sub(r',\s*}', '}', candidate)
    candidate = re.sub(r',\s*]', ']', candidate)

    return candidate


def _repair_json_with_model(raw_text):
    repair_prompt = (
        "Fix and return ONLY valid JSON for the plan schema. "
        "Do not include markdown or extra text.\n\n"
        "Input JSON (may be malformed):\n"
        f"{raw_text}"
    )
    try:
        return _call_openrouter(repair_prompt)
    except Exception as e:
        Logger.error(f"Repair prompt failed: {e}")
        return None


def _safe_json(text):
    cleaned = _repair_json_object(text)
    try:
        return json.loads(cleaned)
    except Exception as e:
        Logger.error(f"JSON parse error: {e}")
        Logger.debug(f"Attempted to parse: {cleaned[:500]}")
        raise ValueError("Plan generator did not return valid JSON") from e


_FALLBACK_MATERIALS = [
    {"title": "Purdue OWL Writing Guide", "url": "https://owl.purdue.edu/owl/general_writing/academic_writing/index.html", "source": "Purdue OWL"},
    {"title": "BBC Learning English", "url": "https://www.bbc.co.uk/learningenglish", "source": "BBC"},
]

_WORD_TARGETS = {"A1": "40-60", "A2": "60-90", "B1": "90-130", "B2": "120-160", "C1": "150-200", "C2": "180-240"}
_MINUTES = {"A1": 20, "A2": 25, "B1": 35, "B2": 40, "C1": 50, "C2": 55}

_SKILL_SENTENCE_RULES = {
    "grammar": "Use the past perfect tense at least twice in your writing.",
    "vocabulary": "Use at least five different descriptive adjectives and avoid repeating any verb more than once.",
    "punctuation": "Pay close attention to punctuation — use commas, full stops, and apostrophes correctly throughout.",
}


def _generate_fallback_tasks_for_day(day_name, level, weak_skills, issues, week_prefix="w0", tasks_per_day=2):
    """Generate fallback tasks from EFCAMDAT bank when AI generation fails."""
    primary_skill = (weak_skills or ["writing"])[0]
    secondary_skill = (weak_skills + ["writing"])[1] if len(weak_skills) > 1 else "writing"
    issue_pool = [i for i in (issues or []) if isinstance(i, str)]
    issue_hint = ", ".join(issue_pool[:2]) if issue_pool else "common accuracy errors"

    wt = _WORD_TARGETS.get(level, "90-130")
    mins = _MINUTES.get(level, 35)
    skill_rule = _SKILL_SENTENCE_RULES.get(primary_skill, "")

    # Pick an EFCAMDAT prompt to anchor the first task
    efcamdat_options = _efcamdat_prompts_for_level(level, skill_focus=primary_skill, limit=10)
    random.shuffle(efcamdat_options)
    anchor = efcamdat_options[0] if efcamdat_options else None

    day3 = day_name.lower()[:3]
    tasks = []

    # Task 1: EFCAMDAT-anchored writing task
    if anchor:
        prompt1 = f"{anchor} ({wt} words)"
        if skill_rule:
            prompt1 += f" {skill_rule}"
    else:
        prompt1 = (
            f"Write {wt} words about a personal experience from {day_name}. "
            f"Focus on {primary_skill}. {skill_rule} Avoid {issue_hint}."
        )

    tasks.append({
        "task_id": f"{week_prefix}_{day3}_task_1",
        "title": f"{primary_skill.title()} Writing Practice",
        "prompt": prompt1,
        "type": "writing_task",
        "estimated_minutes": mins,
        "skills": [primary_skill, "writing"],
        "status": "todo",
        "materials": _FALLBACK_MATERIALS,
    })

    # Task 2: error-targeted revision task with a different topic
    efcamdat_options2 = [p for p in efcamdat_options[1:] if p != anchor]
    anchor2 = efcamdat_options2[0] if efcamdat_options2 else None

    if anchor2:
        prompt2 = (
            f"{anchor2} ({wt} words) "
            f"Avoid {issue_hint}. After writing, underline the sentences where you were most careful about {secondary_skill}."
        )
    else:
        prompt2 = (
            f"Write {wt} words on a topic of your choice related to {day_name}. "
            f"Then revise your text to fix {issue_hint} and improve {secondary_skill}."
        )

    tasks.append({
        "task_id": f"{week_prefix}_{day3}_task_2",
        "title": f"Revision: {secondary_skill.title()} Focus",
        "prompt": prompt2,
        "type": "writing_task",
        "estimated_minutes": max(15, mins - 10),
        "skills": [secondary_skill, "revision"],
        "status": "todo",
        "materials": _FALLBACK_MATERIALS,
    })

    # Respect the user's intensity selection
    return tasks[:tasks_per_day]


def _ensure_tasks_exist(plan, user_id, level, feedback_profile, available_days=None, tasks_per_day=2):
    """Ensure every AVAILABLE day has tasks — skip days not in available_days."""
    plan_json = plan if isinstance(plan, dict) else {}

    if "plan" not in plan_json or not plan_json["plan"]:
        Logger.warning("Plan has no plan array, creating default structure")
        plan_json["plan"] = [{"period": "Week 1", "days": []}]

    # For monthly plans, ensure exactly 4 week periods exist
    if plan_json.get("mode") == "monthly":
        while len(plan_json["plan"]) < 4:
            week_num = len(plan_json["plan"]) + 1
            Logger.warning(f"Monthly plan missing Week {week_num}, adding fallback period")
            plan_json["plan"].append({"period": f"Week {week_num}", "days": []})

    # Build allowed set — if no constraint, all days are allowed
    allowed = {_normalize_day(d) for d in available_days} if available_days else None

    for period_idx, period in enumerate(plan_json.get("plan", []), 1):
        week_prefix = f"w{period_idx}"
        if "days" not in period or not period["days"]:
            Logger.warning("Period has no days, creating default days")
            period["days"] = []

        # Ensure all 7 days exist in the structure
        existing_days = {day.get("day", "") for day in period["days"]}
        for day_name in DAY_NAMES:
            if day_name not in existing_days:
                period["days"].append({"day": day_name, "tasks": []})

        for day in period["days"]:
            day_norm = _normalize_day(day.get("day", ""))
            # Skip days not in the user's available days — leave tasks as []
            if allowed is not None and day_norm not in allowed:
                day["tasks"] = []
                continue
            # Generate fallback tasks only for available days that are empty
            if not day.get("tasks"):
                Logger.info(f"Generating fallback tasks for {day['day']} ({week_prefix})")
                day["tasks"] = _generate_fallback_tasks_for_day(
                    day["day"],
                    level,
                    feedback_profile.get("weak_skills", []),
                    feedback_profile.get("recent_issues", []),
                    week_prefix=week_prefix,
                    tasks_per_day=tasks_per_day,
                )

    return plan_json


def _calculate_end_date(start_dt, mode, period_count):
    if mode == "monthly":
        return start_dt + timedelta(days=30 * max(1, period_count))
    return start_dt + timedelta(days=7 * max(1, period_count))


def Generate_Plan(User_Id, Mode="weekly", Level=None, Issues=None, Preferences=None):
    Logger.info(f"Generating plan for user {User_Id}, mode {Mode}, level {Level}")

    level = _normalize_level(Level or _get_latest_level(User_Id))
    feedback_profile = _get_feedback_profile(User_Id)

    # Parse questionnaire preferences
    prefs = {}
    if Preferences:
        try:
            prefs = json.loads(Preferences)
        except Exception:
            Logger.warning("Could not parse Preferences JSON, ignoring")

    # Merge user-selected focus areas with feedback-detected weak skills
    if prefs.get("focus"):
        selected = [s.lower() for s in prefs["focus"]]
        detected = feedback_profile.get("weak_skills", [])
        # Union: user selection first, then any additional feedback skills not already included
        merged_skills = selected + [s for s in detected if s not in selected]
        feedback_profile["weak_skills"] = merged_skills

    # Build preference context passed to prompt builders
    intensity = prefs.get("intensity", "normal")
    pref_context = {
        "intensity": intensity,
        "tasks_per_day": {"light": 1, "normal": 2, "intensive": 3}.get(intensity, 2),
        "session_minutes": int(prefs.get("sessionMinutes", 40)),
        "user_goal": (prefs.get("goal") or "").strip(),
        "available_days": prefs.get("availableDays", []),
    }

    # Merge exam-detected issues into the feedback profile so the prompt uses them
    if Issues:
        exam_issues = [i for i in Issues if isinstance(i, str)]
        existing = feedback_profile.get("recent_issues") or []
        merged = list({i: None for i in (exam_issues + existing)}.keys())[:10]
        feedback_profile["recent_issues"] = merged
        for skill_kw in ("grammar", "vocabulary", "punctuation"):
            if any(skill_kw in i.lower() for i in exam_issues):
                if skill_kw not in feedback_profile.get("weak_skills", []):
                    feedback_profile.setdefault("weak_skills", []).append(skill_kw)

    level_idx = LEVELS.index(level)
    cefr_range = LEVELS[max(0, level_idx - 1):min(len(LEVELS), level_idx + 2)]

    weak_skills = feedback_profile.get("weak_skills") or ["writing"]
    skill_hint = ", ".join(weak_skills)
    issue_terms = ", ".join(sorted(set(feedback_profile.get("recent_issues") or [])))
    query = (
        f"CEFR {level} {Mode} writing tasks. Focus: {skill_hint}. "
        f"Common issues: {issue_terms if issue_terms else 'general accuracy'}. "
        "Provide clear writing prompts, error-correction practice, and targeted skill drills."
    )

    chunks = _atlas_vector_search(query, cefr_range, top_k=16)

    if Mode == "monthly":
        # Pre-fetch all 4 vector searches in parallel (saves ~4–8s on model load per call)
        week_chunks_list = [None] * 4
        def _fetch_chunks(idx):
            week_chunks_list[idx] = _atlas_vector_search(query, cefr_range, top_k=16)
        fetch_threads = [threading.Thread(target=_fetch_chunks, args=(i,)) for i in range(4)]
        for t in fetch_threads: t.start()
        for t in fetch_threads: t.join()

        # Generate weeks 1 & 2 in parallel, then weeks 3 & 4 in parallel.
        # We use two passes so each pair can include used_titles from prior pairs,
        # keeping task-title deduplication while halving sequential LLM calls.
        periods = [None] * 4
        period_errors = {}

        def _generate_week(week_num, used_titles):
            idx = week_num - 1
            week_prompt = _build_week_prompt(
                level, feedback_profile, week_chunks_list[idx],
                week_num, 4, used_titles=used_titles, pref_context=pref_context,
            )
            Logger.info("Generating monthly plan Week %d/4 for user %s (excluding %d used titles)",
                        week_num, User_Id, len(used_titles))
            _MAX_ATTEMPTS = 3
            last_exc = None
            week_data = None

            # Retry the generation call up to _MAX_ATTEMPTS times before repairing.
            # Most JSON failures are caused by the LLM truncating its output — a
            # fresh call almost always produces valid JSON on the next attempt.
            for attempt in range(1, _MAX_ATTEMPTS + 1):
                try:
                    raw = _call_openrouter(week_prompt)
                    week_data = _safe_json(raw)
                    break  # success
                except ValueError as e:
                    last_exc = e
                    if attempt < _MAX_ATTEMPTS:
                        Logger.warning(
                            "Week %d JSON invalid (attempt %d/%d), retrying: %s",
                            week_num, attempt, _MAX_ATTEMPTS, e,
                        )
                    else:
                        Logger.warning(
                            "Week %d JSON still invalid after %d attempts, trying model repair",
                            week_num, _MAX_ATTEMPTS,
                        )
                        repaired_raw = _repair_json_with_model(raw)
                        if repaired_raw:
                            try:
                                week_data = _safe_json(repaired_raw)
                            except Exception as repair_exc:
                                last_exc = repair_exc
                        # week_data stays None if repair also failed

            try:
                if week_data is None:
                    raise last_exc or RuntimeError("Week generation failed after all retries")
                if "plan" in week_data and isinstance(week_data["plan"], list) and week_data["plan"]:
                    week_data = week_data["plan"][0]
                week_data["period"] = f"Week {week_num}"
                prefix = f"w{week_num}"
                for day in week_data.get("days", []):
                    for task in day.get("tasks", []):
                        tid = task.get("task_id", "")
                        if tid and not tid.startswith(f"{prefix}_"):
                            task["task_id"] = f"{prefix}_{tid}"
                periods[idx] = week_data
            except Exception as e:
                Logger.error("Week %d generation failed: %s", week_num, e)
                periods[idx] = None
                period_errors[idx] = str(e)

        # Pass 1: weeks 1 & 2 in parallel (no prior titles yet)
        t1 = threading.Thread(target=_generate_week, args=(1, []))
        t2 = threading.Thread(target=_generate_week, args=(2, []))
        t1.start(); t2.start()
        t1.join();  t2.join()

        # Pass 2: weeks 3 & 4 in parallel, aware of titles from weeks 1 & 2
        used_after_p1 = _extract_used_titles([p for p in periods[:2] if p])
        t3 = threading.Thread(target=_generate_week, args=(3, used_after_p1))
        t4 = threading.Thread(target=_generate_week, args=(4, used_after_p1))
        t3.start(); t4.start()
        t3.join();  t4.join()

        # If ALL weeks failed, surface the error rather than saving an empty plan
        if period_errors and all(p is None for p in periods):
            first_error = next(iter(period_errors.values()))
            raise RuntimeError(
                f"Monthly plan generation failed — all API keys exhausted or LLM error: {first_error}"
            )

        periods = [p for p in periods if p is not None]

        plan = {
            "cefr_level": level,
            "mode": Mode,
            "focus_skills": feedback_profile.get("weak_skills", ["writing"]),
            "current_period_index": 0,
            "plan": periods,
        }
        Logger.info(f"Monthly plan assembled with {len(periods)} weeks")
    else:
        prompt = _build_prompt(level, Mode, feedback_profile, chunks, pref_context=pref_context)
        try:
            raw = _call_openrouter(prompt)
            try:
                plan = _safe_json(raw)
                Logger.info("Successfully generated plan from AI")
            except Exception as e:
                Logger.warning(f"Plan JSON invalid, attempting repair: {e}")
                repaired_raw = _repair_json_with_model(raw)
                if repaired_raw:
                    plan = _safe_json(repaired_raw)
                    Logger.info("Successfully repaired plan JSON")
                else:
                    raise
        except Exception as e:
            Logger.error(f"AI plan generation failed: {e}")
            # Propagate so the mutation returns an error rather than saving an empty plan
            raise RuntimeError(f"Plan generation failed — all API keys exhausted or LLM error: {e}") from e

    # Hard-enforce available days — strip tasks from any day the user didn't select.
    # This runs after AI generation so it holds regardless of model compliance.
    avail = pref_context.get("available_days", [])
    if avail and isinstance(plan.get("plan"), list):
        plan["plan"] = _enforce_available_days(plan["plan"], avail)

    # Build recommended_resources from RAG chunks (unique URLs with title/skill/source)
    seen_urls = set()
    recommended = []
    for c in chunks:
        url = (c.get("url") or "").strip()
        title = (c.get("title") or "").strip()
        if not url or not title or url in seen_urls:
            continue
        seen_urls.add(url)
        recommended.append({
            "title":  title,
            "url":    url,
            "source": c.get("source", ""),
            "skill":  c.get("skill", ""),
            "cefr_level": c.get("cefr_level", level),
        })

    # If RAG chunks have no URL/title metadata, extract from task materials instead
    if not recommended:
        for period in plan.get("plan", []):
            for day in period.get("days", []):
                for task in day.get("tasks", []):
                    for mat in task.get("materials", []):
                        url = (mat.get("url") or "").strip()
                        title = (mat.get("title") or "").strip()
                        if url and title and url not in seen_urls:
                            seen_urls.add(url)
                            recommended.append({
                                "title":  title,
                                "url":    url,
                                "source": mat.get("source", ""),
                                "skill":  "",
                                "cefr_level": level,
                            })

    plan["recommended_resources"] = recommended[:10]

    now = datetime.utcnow()
    period_count = len(plan.get("plan", []) or [])
    if period_count == 0:
        period_count = 1
    ends_at = _calculate_end_date(now, Mode, period_count)

    latest_exam = _get_latest_level_row(User_Id)
    latest_feedback = _get_latest_feedback_row(User_Id)

    focus_skills = plan.get("focus_skills") or feedback_profile.get("weak_skills") or ["writing"]

    plan["user_id"] = User_Id
    plan["cefr_level"] = level
    plan["mode"] = Mode
    plan["focus_skills"] = focus_skills
    plan["generated_at"] = now.isoformat() + "Z"
    plan["starts_at"] = now.isoformat() + "Z"
    plan["ends_at"] = ends_at.isoformat() + "Z"
    plan["current_period_index"] = int(plan.get("current_period_index") or 0)

    plan["last_exam_at"] = (latest_exam.Created_At.isoformat() + "Z") if latest_exam else None
    plan["last_feedback_at"] = (latest_feedback.Created_At.isoformat() + "Z") if latest_feedback else None

    # Ensure proper structure and tasks (respects available_days and intensity)
    plan = _ensure_tasks_exist(plan, User_Id, level, feedback_profile,
                               available_days=pref_context.get("available_days"),
                               tasks_per_day=pref_context.get("tasks_per_day", 2))

    # Enrich every task with a grammar/vocab/punctuation rule for the learn phase
    plan = _enrich_tasks_with_rules(plan, level)

    # Log task count for debugging
    total_tasks = 0
    for period in plan.get("plan", []):
        for day in period.get("days", []):
            total_tasks += len(day.get("tasks", []))
    Logger.info(f"Plan generated with {total_tasks} total tasks across {len(plan.get('plan', []))} periods")

    return plan