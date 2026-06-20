import json
import logging
import re
import difflib
import graphene
from graphene import ObjectType, String, Boolean, Field, Mutation, Int, List, Float
from django.utils import timezone
from datetime import datetime, date, timezone as dt_timezone, timedelta

from .models import Personalized_Plan, Task_Details
from .services.Plan_Generator import Generate_Plan
from .services.Plan_Adjuster import Adjust_Plan
from .services.Plan_Validator import validate_plan
from Feedback.services.Feedback_Model import Get_Feedback_Analyzer
from middleware.auth import require_auth, rate_limit


Logger = logging.getLogger(__name__)

DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

_AI_THRESHOLD = 97.0


def _deduplicate_text(text: str) -> str:
    """
    Remove duplicate paragraphs/sentences from a submission.
    Users sometimes accidentally paste the same content twice; scoring
    the duplicate twice through the sliding window inflates AI probability.
    """
    import re
    # Split on blank lines first (paragraph-level), fall back to sentence-level
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    seen: list[str] = []
    for p in paragraphs:
        p_norm = re.sub(r"\s+", " ", p).lower()
        # Skip if this paragraph is >80% identical to one already seen
        if not any(
            len(set(p_norm.split()) & set(prev.split())) / max(len(p_norm.split()), 1) > 0.8
            for prev in seen
        ):
            seen.append(p_norm)
    # If deduplication removed anything, rebuild from original paragraphs
    if len(seen) < len(paragraphs):
        kept_originals = []
        seen_norms: list[str] = []
        for p in paragraphs:
            p_norm = re.sub(r"\s+", " ", p).lower()
            if not any(
                len(set(p_norm.split()) & set(prev.split())) / max(len(p_norm.split()), 1) > 0.8
                for prev in seen_norms
            ):
                kept_originals.append(p)
                seen_norms.append(p_norm)
        return "\n\n".join(kept_originals)
    return text


def _check_ai(text):
    """Run AI detection. Returns (is_ai: bool, ai_probability: float).
    Raises on detector crash so callers can treat it as inconclusive rather
    than silently passing every submission as human-written.
    Deduplicates repeated paragraphs before scoring to avoid inflated scores.
    """
    from AI_Detection.services.AI_Detector import is_available, Get_Detector
    if not is_available():
        return False, 0.0
    deduped = _deduplicate_text(text)
    result = Get_Detector().predict(deduped)
    return result["ai_probability"] > _AI_THRESHOLD, result["ai_probability"]


# ── GraphQL types ──────────────────────────────────────────────────────────────

class Plan_Type(ObjectType):
    Data = graphene.JSONString()


class Plan_History_Item(ObjectType):
    Id = String()
    Mode = String()
    Level = String()
    Created_At = String()
    Plan = graphene.JSONString()


class Active_Plan_Item(ObjectType):
    Id = String()
    Mode = String()
    Level = String()
    Created_At = String()
    Updated_At = String()
    Is_Active = Boolean()
    Current_Period_Index = Int()
    Plan = graphene.JSONString()
    Source_Exam_Id = String()


class Task_Detail_Type(ObjectType):
    Id = String()
    User_Id = String()
    Plan_Id = String()
    Task_Id = String()
    Mode = String()
    Level = String()
    Classified_Level = String()
    Classified_Confidence = graphene.Float()
    Period = String()
    Day = String()
    Title = String()
    Type = String()
    Status = String()
    Explanation = String()
    Example_Error = String()
    Example_Correction = String()
    Correction_Reason = String()
    User_Answer = String()
    Input_Text = String()
    Corrected_Text = String()
    Detected_Issues = graphene.JSONString()
    Scores = graphene.JSONString()
    Feedback_Errors = graphene.JSONString()
    Feedback_Error_Trend = String()
    Feedback_Dominant_Error = String()
    Materials_Used = graphene.JSONString()
    Material_Quality = graphene.Float()
    Started_At = String()
    Ends_At = String()
    Submitted_At = String()
    Is_Auto_Submitted = Boolean()
    Created_At = String()
    Updated_At = String()


class Today_Task_Type(ObjectType):
    Task_Id = String()
    Title = String()
    Type = String()
    Estimated_Minutes = Int()
    Status = String()


class Plan_Summary_Type(ObjectType):
    Has_Active_Plan = Boolean()
    Level = String()
    Mode = String()
    Progress_Pct = Int()
    Completed_Tasks = Int()
    Total_Tasks = Int()
    Focus_Skills = List(String)
    Today_Tasks = List(Today_Task_Type)
    Current_Streak = Int()
    Ends_At = String()


class Example_Type(ObjectType):
    Type = String()
    Wrong = String()
    Correct = String()
    Explanation = String()
    Tags = List(String)
    Content = String()
    Source = String()
    Url = String()


# ── Pure helpers (no DB) ───────────────────────────────────────────────────────

def _err_msg(exc):
    msg = str(exc).strip()
    return msg if msg else repr(exc)


def _json_safe(value):
    if isinstance(value, datetime):
        return (value.isoformat() + "Z") if value.tzinfo is None else value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    try:
        from bson import ObjectId
        if isinstance(value, ObjectId):
            return str(value)
    except Exception:
        pass
    return value


def _to_json_string(value):
    return json.dumps(_json_safe(value), ensure_ascii=True)


def _parse_iso(dt_str):
    if not dt_str:
        return None
    try:
        s = dt_str[:-1] if dt_str.endswith("Z") else dt_str
        return datetime.fromisoformat(s).replace(tzinfo=dt_timezone.utc)
    except Exception:
        return None


def _find_task(plan, task_id):
    for period in plan.get("plan", []):
        for day in period.get("days", []):
            for task in day.get("tasks", []):
                if task.get("task_id") == task_id:
                    return period, day, task
    return None, None, None


# ── DB helpers (djongo-safe: no boolean/isnull filters) ───────────────────────

def _get_latest_submitted_exam(user_id):
    """Return the most recent SUBMITTED Exam_Attempt for this user, or None."""
    try:
        from Exam.models import Exam_Attempt
        rows = list(
            Exam_Attempt.objects.filter(User_Id=user_id)
            .order_by("-Submitted_At")[:20]
        )
        for r in rows:
            if r.Status == "SUBMITTED" and r.Submitted_At:
                return r
    except Exception as e:
        Logger.warning("_get_latest_submitted_exam error: %s", e)
    return None


def _extract_exam_issues(exam):
    """Pull detected issue strings from an Exam_Attempt's Question_Results."""
    issues = []
    try:
        for qr in (exam.Question_Results or []):
            if isinstance(qr, dict):
                issues.extend(qr.get("detected_issues", []))
    except Exception:
        pass
    return list(dict.fromkeys(i for i in issues if isinstance(i, str)))[:10]


def _can_generate(user_id, mode):
    """
    Returns (allowed: bool, exam: Exam_Attempt|None, reason: str).
    allowed=True  → a new exam exists that hasn't been used for a plan yet.
    allowed=False → no exam, or latest exam already used for the last plan.
    reason values: 'no_exam' | 'first_plan' | 'same_exam' | 'new_exam'
    """
    exam = _get_latest_submitted_exam(user_id)
    if not exam:
        return False, None, "no_exam"

    try:
        rows = list(
            Personalized_Plan.objects.filter(User_Id=user_id, Mode=mode)
            .order_by("-Created_At")[:1]
        )
        last_plan = rows[0] if rows else None
    except Exception:
        last_plan = None

    if not last_plan:
        return True, exam, "first_plan"

    if last_plan.Source_Exam_Id == exam.Attempt_Id:
        return False, exam, "same_exam"

    return True, exam, "new_exam"


def _deactivate_active_plans(user_id, mode):
    """Deactivate all active plans for user+mode. Filters in Python (djongo boolean fix)."""
    try:
        rows = Personalized_Plan.objects.filter(User_Id=user_id, Mode=mode).order_by("-Created_At")
        for r in rows:
            if r.Is_Active:
                r.Is_Active = False
                r.save()
    except Exception as e:
        Logger.warning("_deactivate_active_plans error: %s", e)


def _get_active_plan_row(user_id, mode):
    """Return the active plan row. Filters Is_Active in Python (djongo boolean fix)."""
    try:
        rows = Personalized_Plan.objects.filter(User_Id=user_id, Mode=mode).order_by("-Created_At")
        for r in rows:
            if r.Is_Active:
                _sanitize_plan_row(r)
                return r
    except Exception as e:
        Logger.warning("_get_active_plan_row error: %s", e)
    return None


def _sanitize_plan_row(row):
    """Ensure JSONFields on an existing row are never None (djongo safety)."""
    if row.Focus_Skills is None:
        row.Focus_Skills = []
    if row.Source_Exam_Issues is None:
        row.Source_Exam_Issues = []
    if row.Plan is None:
        row.Plan = {}


def _save_new_plan(user_id, mode, plan, source_exam_id='', source_exam_issues=None):
    plan = _json_safe(plan)
    starts_at = _parse_iso(plan.get("starts_at")) or timezone.now()
    ends_at = _parse_iso(plan.get("ends_at"))
    _deactivate_active_plans(user_id, mode)
    return Personalized_Plan.objects.create(
        User_Id=user_id,
        Mode=mode,
        Level=plan.get("cefr_level", "A1"),
        Focus_Skills=plan.get("focus_skills", []),
        Plan=plan,
        Is_Active=True,
        Starts_At=starts_at,
        Ends_At=ends_at,
        Current_Period_Index=int(plan.get("current_period_index", 0)),
        Source_Exam_Id=source_exam_id or '',
        Source_Exam_Issues=source_exam_issues or [],
    )


def _get_task_details_for_plan(user_id, plan_id):
    """Load all Task_Details for a plan. Simple equality filter (djongo-safe)."""
    try:
        return list(Task_Details.objects.filter(User_Id=user_id, Plan_Id=plan_id))
    except Exception as e:
        Logger.warning("_get_task_details_for_plan error: %s", e)
        return []


def _get_all_submitted_tasks(user_id):
    """Load all Task_Details for user then filter submitted in Python (djongo isnull fix)."""
    try:
        all_tasks = list(Task_Details.objects.filter(User_Id=user_id).order_by("-Created_At"))
        return [t for t in all_tasks if t.Submitted_At is not None]
    except Exception as e:
        Logger.warning("_get_all_submitted_tasks error: %s", e)
        return []


def _compute_streak(user_id):
    """Compute current streak from submitted tasks. Uses Python-side filtering."""
    submitted = _get_all_submitted_tasks(user_id)
    if not submitted:
        return 0

    active_dates = sorted(
        {t.Submitted_At.date() for t in submitted if t.Submitted_At},
        reverse=True,
    )
    if not active_dates:
        return 0

    current_streak = 0
    today = date.today()
    expected = today
    for d in active_dates:
        if d == expected or d == expected - timedelta(days=1):
            current_streak += 1
            expected = d - timedelta(days=1)
        else:
            break
    return current_streak


def _get_today_tasks_from_plan(plan_json, period_index, task_map):
    """Return today's tasks list merged with DB status."""
    try:
        periods = plan_json.get("plan", [])
        if not periods:
            return []
        period_index = min(period_index, len(periods) - 1)
        period = periods[period_index]

        # Python weekday: Mon=0..Sun=6 → our list: Sun=0 Mon=1..Sat=6
        py_wd = date.today().weekday()
        today = DAY_NAMES[(py_wd + 1) % 7]

        for day in period.get("days", []):
            if day.get("day", "").lower() == today.lower():
                tasks = []
                for t in day.get("tasks", []):
                    tid = t.get("task_id", "")
                    detail = task_map.get(tid)
                    tasks.append({
                        "Task_Id": tid,
                        "Title": t.get("title") or t.get("prompt") or t.get("type", ""),
                        "Type": t.get("type", ""),
                        "Estimated_Minutes": int(t.get("estimated_minutes") or 30),
                        "Status": detail.Status if detail else t.get("status", "todo"),
                    })
                return tasks
    except Exception as e:
        Logger.error("_get_today_tasks_from_plan error: %s", e)
    return []


def _convert_task_detail(model):
    if not model:
        return None
    _scores = model.Scores if isinstance(model.Scores, dict) else {}
    return Task_Detail_Type(
        Id=str(model._id),
        User_Id=model.User_Id,
        Plan_Id=model.Plan_Id,
        Task_Id=model.Task_Id,
        Mode=model.Mode,
        Level=model.Level,
        Classified_Level=_scores.get("classified_level") or None,
        Classified_Confidence=float(_scores["classified_confidence"]) if _scores.get("classified_confidence") is not None else None,
        Period=model.Period,
        Day=model.Day,
        Title=model.Title,
        Type=model.Type,
        Status=model.Status,
        Explanation=model.Explanation,
        Example_Error=model.Example_Error,
        Example_Correction=model.Example_Correction,
        Correction_Reason=model.Correction_Reason,
        User_Answer=model.Input_Text,
        Input_Text=model.Input_Text,
        Corrected_Text=model.Corrected_Text,
        Detected_Issues=_to_json_string(model.Detected_Issues),
        Scores=_to_json_string(model.Scores),
        Feedback_Errors=_to_json_string(getattr(model, 'Feedback_Errors', [])),
        Feedback_Error_Trend=getattr(model, 'Feedback_Error_Trend', '') or '',
        Feedback_Dominant_Error=getattr(model, 'Feedback_Dominant_Error', '') or '',
        Materials_Used=_to_json_string(model.Materials_Used),
        Material_Quality=float(model.Material_Quality or 0),
        Started_At=str(model.Started_At) if model.Started_At else None,
        Ends_At=str(model.Ends_At) if model.Ends_At else None,
        Submitted_At=str(model.Submitted_At) if model.Submitted_At else None,
        Is_Auto_Submitted=model.Is_Auto_Submitted,
        Created_At=str(model.Created_At),
        Updated_At=str(model.Updated_At),
    )


# ── Example helpers ────────────────────────────────────────────────────────────

def _clean_text(text):
    return re.sub(r"\s+", " ", text or "").strip()


def _strip_instruction_prefix(text):
    if not text:
        return ""
    return re.sub(
        r"^(instruction|fix grammar errors|fix grammar|correct the text|gec|grammar correction)\s*[:\-]*\s*",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()


def _tokenize_words(text):
    return re.findall(r"[A-Za-z']+|[.,!?;:]", text)


def _min_words_for_level(level):
    level = (level or "").upper()
    if level in ("A1", "A2"):
        return 4
    if level in ("B1", "B2"):
        return 6
    return 8


def _is_punct(token):
    return token in {".", ",", "?", "!", ";", ":"}


def _has_subject_verb_agreement_change(original, corrected):
    orig, corr = original.lower(), corrected.lower()
    patterns = [
        (r"\bi\b \w+s\b", r"\bi\b \w+\b"),
        (r"\byou\b \w+s\b", r"\byou\b \w+\b"),
        (r"\bhe\b \w+\b", r"\bhe\b \w+s\b"),
        (r"\bshe\b \w+\b", r"\bshe\b \w+s\b"),
        (r"\bthey\b \w+s\b", r"\bthey\b \w+\b"),
    ]
    for bad, good in patterns:
        if re.search(bad, orig) and re.search(good, corr):
            return True
    return False


def _is_passive_voice(text):
    return bool(re.search(r"\b(am|is|are|was|were|be|been|being)\b\s+\w+(ed|en)\b", text.lower()))


def _detect_tense_shift(original, corrected):
    orig, corr = original.lower(), corrected.lower()
    if bool(re.search(r"\b(is|are|do|does|have|has)\b", orig)) and bool(re.search(r"\b(was|were|did|had)\b", corr)):
        return "Tense was shifted to past for consistency."
    if bool(re.search(r"\b(was|were|did|had)\b", orig)) and bool(re.search(r"\b(is|are|do|does|have|has)\b", corr)):
        return "Tense was shifted to present for consistency."
    return None


def _extract_edits(original, corrected, limit=3):
    orig_words = _tokenize_words(original)
    corr_words = _tokenize_words(corrected)
    sm = difflib.SequenceMatcher(None, orig_words, corr_words)
    edits = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            continue
        old = " ".join(orig_words[i1:i2]).strip()
        new = " ".join(corr_words[j1:j2]).strip()
        if old or new:
            edits.append((op, old, new))
    return edits[:limit]


def _format_edits(edits):
    """Format edits cleanly without redundancy."""
    parts = []
    for op, old, new in edits:
        if op == "delete" and old:
            parts.append(f"{old!r} → (removed)")
        elif op == "insert" and new:
            parts.append(f"(added) → {new!r}")
        elif old and new:
            parts.append(f"{old!r} → {new!r}")
    return "; ".join(parts)


def _classify_changes(original, corrected, edits):
    tags = set()
    if any(_is_punct(e[1]) or _is_punct(e[2]) for e in edits):
        tags.add("punctuation")
    if _has_subject_verb_agreement_change(original, corrected):
        tags.add("grammar")
    tense_note = _detect_tense_shift(original, corrected)
    if tense_note:
        tags.add("tense")
    orig_passive = _is_passive_voice(original)
    corr_passive = _is_passive_voice(corrected)
    if orig_passive != corr_passive:
        tags.add("voice")
    article_set = {"a", "an", "the"}
    prep_set = {"in", "on", "at", "to", "for", "of"}
    for _, old, new in edits:
        if old.lower() in article_set or new.lower() in article_set:
            tags.add("articles")
        if old.lower() in prep_set or new.lower() in prep_set:
            tags.add("prepositions")
    if not tags and edits:
        tags.add("word-choice")
    return sorted(tags), tense_note, orig_passive, corr_passive


def _is_low_value_example(original, corrected, edits):
    if _clean_text(original).lower() == _clean_text(corrected).lower():
        return True
    non_punct = [e for e in edits if not (_is_punct(e[1]) or _is_punct(e[2]))]
    return not non_punct and len(edits) <= 1


def _build_explanation(original, corrected, level):
    """
    Build a clean, non-redundant explanation.
    Returns (explanation_str, tags_list) or (None, None) for low-value examples.
    """
    original = _clean_text(original)
    corrected = _clean_text(corrected)
    if not original or not corrected:
        return None, None

    edits = _extract_edits(original, corrected, limit=3)
    if _is_low_value_example(original, corrected, edits):
        return None, None

    tags, tense_note, orig_passive, corr_passive = _classify_changes(original, corrected, edits)

    # Build one concise reason sentence (not a list)
    reasons = []

    if original and corrected and original[0].islower() and corrected[0].isupper():
        reasons.append("Sentence capitalisation was corrected")
    if _has_subject_verb_agreement_change(original, corrected):
        reasons.append("Subject-verb agreement was fixed")
    if tense_note:
        reasons.append(tense_note.rstrip("."))
    if orig_passive and not corr_passive:
        reasons.append("Passive voice was changed to active")
    elif not orig_passive and corr_passive:
        reasons.append("Active voice was changed to passive for formality")
    if "articles" in tags:
        reasons.append("Article (a/an/the) was corrected")
    if "prepositions" in tags:
        reasons.append("Preposition choice was corrected")
    if "punctuation" in tags:
        reasons.append("Punctuation was adjusted")
    if "word-choice" in tags and not reasons:
        reasons.append("Word choice was adjusted for correctness or clarity")

    if not reasons:
        reasons.append("Grammar and phrasing were improved")

    # Single reason sentence + edit detail
    why = reasons[0] + "."
    edit_detail = _format_edits(edits)
    if edit_detail:
        explanation = f"{why} Example edits: {edit_detail}."
    else:
        explanation = why

    return explanation, list(tags)


def _atlas_vector_search(query_text, cefr_levels, top_k=12):
    import os
    from pymongo import MongoClient
    from sentence_transformers import SentenceTransformer

    mongo_uri = os.getenv("MONGODB_URI") or os.getenv("MONGO_URL")
    if not mongo_uri:
        return []
    try:
        model = SentenceTransformer(os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"))
        query_vector = model.encode(query_text).tolist()
        client = MongoClient(mongo_uri)
        coll = client[os.getenv("MONGODB_DB", "Rag")][os.getenv("RAG_COLLECTION", "Chunks")]
        pipeline = [
            {"$vectorSearch": {
                "index": os.getenv("RAG_VECTOR_INDEX", "rag_vector_index"),
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": 200,
                "limit": top_k,
                "filter": {"cefr_level": {"$in": cefr_levels}},
            }},
            {"$project": {"_id": 0, "id": 1, "text": 1, "chunk_type": 1,
                          "skill": 1, "source": 1, "title": 1, "url": 1, "cefr_level": 1}},
        ]
        return list(coll.aggregate(pipeline))
    except Exception as e:
        Logger.error("Vector search failed: %s", e)
        return []


# ── Mutations ──────────────────────────────────────────────────────────────────

def _get_source_exam_for_mode_switch(user_id, from_mode):
    """
    For a mode switch (weekly↔monthly), retrieve the exam that was used for
    the currently active plan in from_mode so we can reuse it in the new mode.
    Returns the Exam_Attempt row or None.
    """
    from Exam.models import Exam_Attempt
    active = _get_active_plan_row(user_id, from_mode)
    if not active or not active.Source_Exam_Id:
        return None
    rows = list(Exam_Attempt.objects.filter(
        User_Id=user_id, Attempt_Id=active.Source_Exam_Id
    )[:1])
    return rows[0] if rows else None


class Generate_Plan_Mutation(Mutation):
    class Arguments:
        User_Id          = String(required=True)
        Mode             = String(required=True)
        Save_To_Database = Boolean(default_value=True)
        Exam_Id          = String(required=False)
        Preferences      = String(required=False)   # JSON string from questionnaire
        Is_Mode_Switch   = Boolean(default_value=False)  # True when switching weekly↔monthly
        From_Mode        = String(required=False)         # the mode being switched away from

    Success = Boolean()
    Plan = Field(Plan_Type)
    Error = String()
    Status = String()
    Recommended_Resources = graphene.JSONString()

    @require_auth
    @rate_limit(max_calls=5, window_seconds=3600)   # 5 plan generations per hour
    def mutate(self, info, User_Id, Mode, Save_To_Database=True, Exam_Id=None,
               Preferences=None, Is_Mode_Switch=False, From_Mode=None):
        try:
            from Exam.models import Exam_Attempt

            exam = None

            # ── Mode-switch path: reuse the exam from the active plan ────────
            if Is_Mode_Switch:
                if not From_Mode:
                    return Generate_Plan_Mutation(
                        Success=False,
                        Error="From_Mode is required when Is_Mode_Switch is True.",
                        Status="missing_from_mode",
                    )
                if From_Mode == Mode:
                    return Generate_Plan_Mutation(
                        Success=False,
                        Error="From_Mode and Mode must be different.",
                        Status="same_mode",
                    )

                exam = _get_source_exam_for_mode_switch(User_Id, From_Mode)
                if not exam:
                    return Generate_Plan_Mutation(
                        Success=False,
                        Error="No active plan found for the current mode to switch from. "
                              "Generate a plan first.",
                        Status="no_source_plan",
                    )
                status_label = "mode_switch"

            # ── Normal path ─────────────────────────────────────────────────
            else:
                if Exam_Id:
                    rows = list(Exam_Attempt.objects.filter(User_Id=User_Id, Attempt_Id=Exam_Id)[:1])
                    if not rows:
                        return Generate_Plan_Mutation(
                            Success=False,
                            Error="Exam not found.",
                            Status="exam_not_found",
                        )
                    exam = rows[0]
                    if exam.Status != "SUBMITTED":
                        return Generate_Plan_Mutation(
                            Success=False,
                            Error="Exam has not been submitted yet.",
                            Status="exam_not_submitted",
                        )
                else:
                    exam = _get_latest_submitted_exam(User_Id)
                    if not exam:
                        return Generate_Plan_Mutation(
                            Success=False,
                            Error="No submitted exam found. Please take an exam first.",
                            Status="no_exam",
                        )

                # Gate: block if this exam is already linked to an active plan
                # in the target mode
                allowed, _, reason = _can_generate(User_Id, Mode)
                if not allowed and reason == "same_exam":
                    return Generate_Plan_Mutation(
                        Success=False,
                        Error="Your current plan was already generated from your latest exam. "
                              "Take a new exam to generate a new plan.",
                        Status="same_exam",
                    )
                status_label = "generated"

            level  = exam.Final_Level or exam.Level or "A1"
            issues = _extract_exam_issues(exam)

            plan = Generate_Plan(User_Id=User_Id, Mode=Mode, Level=level, Issues=issues, Preferences=Preferences)
            validate_plan(plan)
            plan = _json_safe(plan)

            recommendations_json = None
            recs = []
            try:
                import json as _json
                from Resources.services.Recommender import get_recommendations
                recs = get_recommendations(issues=issues, cefr_level=level, user_id=User_Id, limit=3)
                if recs:
                    recommendations_json = _json.dumps(recs)
            except Exception as _re:
                Logger.warning("Resource recommendations failed: %s", _re)

            # Embed recommendations into the plan so they survive page reload
            if recs:
                plan["recommended_resources"] = recs

            if Save_To_Database:
                _save_new_plan(User_Id, Mode, plan,
                               source_exam_id=exam.Attempt_Id,
                               source_exam_issues=issues)

            return Generate_Plan_Mutation(
                Success=True,
                Plan=Plan_Type(Data=_to_json_string(plan)),
                Status=status_label,
                Recommended_Resources=recommendations_json,
            )
        except Exception as e:
            Logger.exception("Generate_Plan failed")
            return Generate_Plan_Mutation(Success=False, Error=_err_msg(e))


class Generate_Next_Plan_Mutation(Mutation):
    class Arguments:
        User_Id = String(required=True)
        Mode = String(required=True)

    Success = Boolean()
    Plan = Field(Plan_Type)
    Status = String()
    Error = String()
    Recommended_Resources = graphene.JSONString()

    @require_auth
    def mutate(self, info, User_Id, Mode):
        try:
            # Return existing active plan if present
            active = _get_active_plan_row(User_Id, Mode)
            if active:
                return Generate_Next_Plan_Mutation(
                    Success=True,
                    Plan=Plan_Type(Data=_to_json_string(active.Plan)),
                    Status="already_active",
                )

            # Check exam gate
            allowed, exam, reason = _can_generate(User_Id, Mode)

            if not allowed:
                if reason == "no_exam":
                    return Generate_Next_Plan_Mutation(
                        Success=True, Plan=None, Status="no_exam"
                    )
                # same_exam: period was completed but no new exam yet
                return Generate_Next_Plan_Mutation(
                    Success=True, Plan=None, Status="needs_exam"
                )

            # Allowed — generate with exam data
            level = exam.Final_Level or exam.Level or "A1"
            issues = _extract_exam_issues(exam)
            plan = Generate_Plan(User_Id=User_Id, Mode=Mode, Level=level, Issues=issues)
            validate_plan(plan)
            plan = _json_safe(plan)

            next_recs_json = None
            recs = []
            try:
                import json as _json
                from Resources.services.Recommender import get_recommendations
                recs = get_recommendations(issues=issues, cefr_level=level, user_id=User_Id, limit=3)
                if recs:
                    next_recs_json = _json.dumps(recs)
            except Exception as _re:
                Logger.warning("Resource recommendations failed: %s", _re)

            # Embed recommendations into the plan so they survive page reload
            if recs:
                plan["recommended_resources"] = recs

            _save_new_plan(User_Id, Mode, plan,
                           source_exam_id=exam.Attempt_Id,
                           source_exam_issues=issues)

            status = "generated_first_plan" if reason == "first_plan" else "generated_new_plan"
            return Generate_Next_Plan_Mutation(
                Success=True,
                Recommended_Resources=next_recs_json,
                Plan=Plan_Type(Data=_to_json_string(plan)),
                Status=status,
            )
        except Exception as e:
            Logger.exception("Generate_Next_Plan failed")
            return Generate_Next_Plan_Mutation(Success=False, Error=_err_msg(e))


class Adjust_Plan_Mutation(Mutation):
    class Arguments:
        User_Id             = String(required=True)
        Instruction         = String(required=True)
        Current_Plan        = String(required=True)
        Selected_Period_Index = Int(default_value=0)
        Selected_Day_Index  = Int()
        Target_Day          = String()    # e.g. "Thursday"
        Pinned_Task         = String()    # JSON string of the task the user pinned
        Chat_Depth          = Int(default_value=0)  # how many turns on same topic

    Success      = Boolean()
    Plan         = Field(Plan_Type)
    Error        = String()
    Intent       = String()   # add_task | remove_task | explain_task | get_examples | modify_task | general
    Chat_Message = String()   # bot reply to show in the chat bubble
    Diff_Summary = String()   # human-readable description of what changed

    @require_auth
    @rate_limit(max_calls=20, window_seconds=3600)
    def mutate(self, info, User_Id, Instruction, Current_Plan,
               Selected_Period_Index=0, Selected_Day_Index=None,
               Target_Day=None, Pinned_Task=None, Chat_Depth=0):
        try:
            try:
                current_plan_data = json.loads(Current_Plan)
            except json.JSONDecodeError as e:
                return Adjust_Plan_Mutation(Success=False, Error=f"Invalid plan JSON: {e}")

            pinned_task_data = None
            if Pinned_Task:
                try:
                    pinned_task_data = json.loads(Pinned_Task)
                except Exception:
                    pass

            result = Adjust_Plan(
                current_plan=current_plan_data,
                instruction=Instruction,
                selected_period_index=Selected_Period_Index,
                selected_day_index=Selected_Day_Index,
                target_day=Target_Day,
                pinned_task=pinned_task_data,
                chat_depth=int(Chat_Depth or 0),
            )

            modified_plan = result.get("modified_plan")
            plan_type = None
            if modified_plan:
                # Enrich any new tasks that are missing learn fields
                try:
                    from Personalized_Plan.services.Plan_Generator import _enrich_tasks_with_rules
                    active_row = _get_active_plan_row(User_Id, "weekly") or _get_active_plan_row(User_Id, "monthly")
                    level = active_row.Level if active_row else (modified_plan.get("cefr_level") or "B1")
                    modified_plan = _enrich_tasks_with_rules(modified_plan, level)
                except Exception as _re:
                    Logger.warning("Adjust_Plan: rule enrichment failed: %s", _re)

                # Inject fallback materials + recommended resources for newly added tasks
                if result.get("intent") == "add_task":
                    try:
                        from Personalized_Plan.services.Plan_Generator import _FALLBACK_MATERIALS
                        from Resources.services.Recommender import get_recommendations
                        new_task_skills = []
                        for period in modified_plan.get("plan", []):
                            for day in period.get("days", []):
                                for t in day.get("tasks", []):
                                    if t.get("task_id", "").startswith("new_"):
                                        # Give the task fallback materials if empty
                                        if not t.get("materials"):
                                            t["materials"] = list(_FALLBACK_MATERIALS)
                                        new_task_skills.append(t.get("type", t.get("title", "")))
                        # Add to plan-level recommended_resources as well
                        issues = new_task_skills or ["writing", "grammar"]
                        new_recs = get_recommendations(issues=issues, cefr_level=level, user_id=User_Id, limit=3)
                        existing_recs = modified_plan.get("recommended_resources") or []
                        existing_urls = {r.get("url") for r in existing_recs if r.get("url")}
                        for rec in new_recs:
                            if rec.get("url") not in existing_urls:
                                existing_recs.append(rec)
                                existing_urls.add(rec.get("url"))
                        modified_plan["recommended_resources"] = existing_recs
                    except Exception as _rre:
                        Logger.warning("Adjust_Plan: resource recommendation failed: %s", _rre)

                plan_type = Plan_Type(Data=_to_json_string(_json_safe(modified_plan)))

            return Adjust_Plan_Mutation(
                Success=True,
                Plan=plan_type,
                Intent=result.get("intent", "general"),
                Chat_Message=result.get("chat_response", "Plan updated."),
                Diff_Summary=result.get("diff_summary", ""),
            )
        except Exception as e:
            Logger.exception("Adjust_Plan error")
            return Adjust_Plan_Mutation(Success=False, Error=_err_msg(e))


class Save_Plan_Mutation(Mutation):
    class Arguments:
        User_Id = String(required=True)
        Plan = String(required=True)
        Mode = String(required=True)
        Level = String(required=True)

    Success = Boolean()
    Error = String()

    @require_auth
    def mutate(self, info, User_Id, Plan, Mode, Level):
        try:
            try:
                plan_data = json.loads(Plan)
            except json.JSONDecodeError as e:
                return Save_Plan_Mutation(Success=False, Error=f"Invalid plan JSON: {e}")
            validate_plan(plan_data)
            _save_new_plan(User_Id, Mode, plan_data)
            return Save_Plan_Mutation(Success=True)
        except Exception as e:
            Logger.exception("Save_Plan error")
            return Save_Plan_Mutation(Success=False, Error=_err_msg(e))


class Mark_Plan_Period_Done_Mutation(Mutation):
    class Arguments:
        User_Id = String(required=True)
        Mode = String(required=True)

    Success = Boolean()
    Plan = Field(Plan_Type)
    Status = String()
    Error = String()

    @require_auth
    def mutate(self, info, User_Id, Mode):
        try:
            plan_row = _get_active_plan_row(User_Id, Mode)
            if not plan_row:
                return Mark_Plan_Period_Done_Mutation(Success=False, Error="No active plan found.")

            plan = plan_row.Plan or {}
            plan_list = plan.get("plan", [])
            if not isinstance(plan_list, list) or not plan_list:
                return Mark_Plan_Period_Done_Mutation(Success=False, Error="Active plan is invalid.")

            current_idx = int(plan_row.Current_Period_Index or 0)

            # In MONTHLY mode the user completes the WHOLE month at once: the 80%
            # gate counts every task across all weeks, and one "Complete Period"
            # finishes the entire plan instead of advancing week-by-week.
            # In WEEKLY mode the gate/advance applies to the current period only.
            is_monthly = (Mode or "").strip().lower() == "monthly"

            # ── 80% completion gate ──────────────────────────────────────────
            # Read task completion from Task_Details (authoritative source),
            # not the plan JSON (which does not get updated when tasks are done).
            try:
                if is_monthly:
                    periods_to_check = plan_list
                else:
                    periods_to_check = (
                        [plan_list[current_idx]] if current_idx < len(plan_list) else []
                    )
                plan_id_str = str(plan_row.id)
                done_statuses = {"submitted", "completed", "done"}
                total = 0
                done = 0
                for per in periods_to_check:
                    period_name = per.get("period", "")
                    period_tasks = []
                    for day in per.get("days", []):
                        period_tasks.extend(day.get("tasks", []))
                    total += len(period_tasks)
                    if period_tasks:
                        all_rows = Task_Details.objects.filter(
                            User_Id=User_Id,
                            Plan_Id=plan_id_str,
                            Period=period_name,
                        ).values_list("Status", flat=True)
                        done += sum(1 for s in all_rows if (s or "").lower() in done_statuses)
                if total > 0:
                    pct = round(done / total * 100)
                    if pct < 80:
                        scope = "the month's" if is_monthly else "this period's"
                        return Mark_Plan_Period_Done_Mutation(
                            Success=False,
                            Error=f"You must complete at least 80% of {scope} tasks before moving on. "
                                  f"Currently at {pct}% ({done}/{total} tasks done).",
                            Status="insufficient_completion",
                        )
            except Exception as _ge:
                Logger.warning("80%% gate check failed (skipping): %s", _ge)
            # ────────────────────────────────────────────────────────────────

            # Weekly mode advances one period at a time; monthly mode falls through
            # to the "mark complete" branch so the whole month finishes at once.
            if not is_monthly and current_idx < len(plan_list) - 1:
                current_idx += 1
                plan_row.Current_Period_Index = current_idx
                plan["current_period_index"] = current_idx
                plan_row.Plan = _json_safe(plan)
                plan_row.save()
                return Mark_Plan_Period_Done_Mutation(
                    Success=True,
                    Plan=Plan_Type(Data=_to_json_string(plan)),
                    Status="period_advanced",
                )

            # Last period done — mark complete
            plan_row.Is_Active = False
            plan_row.Completed_At = timezone.now()
            plan_row.Current_Period_Index = len(plan_list) - 1
            plan["current_period_index"] = len(plan_list) - 1
            plan_row.Plan = _json_safe(plan)
            plan_row.save()

            # Check exam gate: only auto-generate if a NEW exam was taken after this plan
            allowed, exam, reason = _can_generate(User_Id, Mode)
            if allowed and exam:
                try:
                    level = exam.Final_Level or exam.Level or "A1"
                    issues = _extract_exam_issues(exam)
                    new_plan = Generate_Plan(User_Id=User_Id, Mode=Mode, Level=level, Issues=issues)
                    validate_plan(new_plan)
                    new_plan = _json_safe(new_plan)
                    _save_new_plan(User_Id, Mode, new_plan,
                                   source_exam_id=exam.Attempt_Id,
                                   source_exam_issues=issues)
                    return Mark_Plan_Period_Done_Mutation(
                        Success=True,
                        Plan=Plan_Type(Data=_to_json_string(new_plan)),
                        Status="new_plan_generated",
                    )
                except Exception as gen_err:
                    Logger.warning("Auto-generation after period complete failed: %s", gen_err)

            return Mark_Plan_Period_Done_Mutation(Success=True, Plan=None, Status="needs_exam")
        except Exception as e:
            Logger.exception("Mark_Plan_Period_Done failed")
            return Mark_Plan_Period_Done_Mutation(Success=False, Error=_err_msg(e))


class Start_Task_Mutation(Mutation):
    class Arguments:
        User_Id = String(required=True)
        Plan_Id = String(required=True)
        Task_Id = String(required=True)
        Started_At = String(required=False)
        Ends_At = String(required=False)

    Success = Boolean()
    Task = Field(Task_Detail_Type)
    Error = String()

    @require_auth
    def mutate(self, info, User_Id, Plan_Id, Task_Id, Started_At=None, Ends_At=None):
        try:
            from bson import ObjectId
            try:
                plan_obj_id = ObjectId(Plan_Id)
            except Exception:
                return Start_Task_Mutation(Success=False, Error=f"Invalid Plan_Id: {Plan_Id}")

            # djongo-safe: filter by _id using the ObjectId directly
            plan_row = None
            try:
                rows = list(Personalized_Plan.objects.filter(_id=plan_obj_id))
                plan_row = rows[0] if rows else None
            except Exception:
                pass

            if not plan_row:
                return Start_Task_Mutation(Success=False, Error=f"Plan not found: {Plan_Id}")
            _sanitize_plan_row(plan_row)

            period, day, task = _find_task(plan_row.Plan, Task_Id)
            if not task:
                return Start_Task_Mutation(Success=False, Error=f"Task not found: {Task_Id}")

            started_at = _parse_iso(Started_At) or timezone.now()
            ends_at = _parse_iso(Ends_At)

            # Load existing task record (djongo-safe equality filter)
            existing = None
            try:
                rows = list(Task_Details.objects.filter(User_Id=User_Id, Plan_Id=Plan_Id, Task_Id=Task_Id))
                existing = rows[0] if rows else None
            except Exception:
                pass

            if not existing:
                record = Task_Details.objects.create(
                    User_Id=User_Id,
                    Plan_Id=Plan_Id,
                    Task_Id=Task_Id,
                    Mode=plan_row.Mode,
                    Level=plan_row.Level,
                    Period=period.get("period", "") if period else "",
                    Day=day.get("day", "") if day else "",
                    Title=task.get("title", ""),
                    Type=task.get("type", ""),
                    Status="in_progress",
                    Explanation=task.get("explanation", ""),
                    Example_Error=task.get("example_error", ""),
                    Example_Correction=task.get("example_correction", ""),
                    Correction_Reason=task.get("correction_reason", ""),
                    Started_At=started_at,
                    Ends_At=ends_at,
                    Materials_Used=task.get("materials", []),
                )
            else:
                record = existing
                record.Status = "in_progress"
                record.Started_At = started_at
                record.Ends_At = ends_at
                if not record.Explanation:
                    record.Explanation = task.get("explanation", "")
                    record.Example_Error = task.get("example_error", "")
                    record.Example_Correction = task.get("example_correction", "")
                    record.Correction_Reason = task.get("correction_reason", "")
                record.save()

            task["status"] = "in_progress"
            plan_row.Plan = _json_safe(plan_row.Plan)
            plan_row.save()

            return Start_Task_Mutation(Success=True, Task=_convert_task_detail(record))
        except Exception as e:
            Logger.exception("Start_Task error")
            return Start_Task_Mutation(Success=False, Error=_err_msg(e))


class Submit_Task_Text_Mutation(Mutation):
    class Arguments:
        User_Id = String(required=True)
        Plan_Id = String(required=True)
        Task_Id = String(required=True)
        Input_Text = String(required=True)
        Is_Auto_Submitted = Boolean(default_value=False)

    Success = Boolean()
    Task = Field(Task_Detail_Type)
    AI_Detected = Boolean()
    AI_Confidence = Float()
    Recommended_Resources = graphene.JSONString()
    Error = String()

    @require_auth
    def mutate(self, info, User_Id, Plan_Id, Task_Id, Input_Text, Is_Auto_Submitted=False):
        try:
            from bson import ObjectId
            try:
                plan_obj_id = ObjectId(Plan_Id)
            except Exception:
                return Submit_Task_Text_Mutation(Success=False, Error=f"Invalid Plan_Id: {Plan_Id}")

            plan_row = None
            try:
                rows = list(Personalized_Plan.objects.filter(_id=plan_obj_id))
                plan_row = rows[0] if rows else None
            except Exception:
                pass

            if not plan_row:
                return Submit_Task_Text_Mutation(Success=False, Error=f"Plan not found: {Plan_Id}")
            _sanitize_plan_row(plan_row)

            period, day, task = _find_task(plan_row.Plan, Task_Id)
            if not task:
                return Submit_Task_Text_Mutation(Success=False, Error=f"Task not found: {Task_Id}")

            # ── AI detection check ─────────────────────────────────────────────
            try:
                is_ai, ai_prob = _check_ai(Input_Text)
            except Exception as det_err:
                Logger.error("AI detector crashed — rejecting submission: %s", det_err)
                return Submit_Task_Text_Mutation(
                    Success=False,
                    AI_Detected=False,
                    AI_Confidence=0.0,
                    Error="Submission could not be verified at this time. Please try again in a moment.",
                )
            if is_ai:
                # Persist the cancellation so the plan reflects the AI rejection
                try:
                    rows = list(Task_Details.objects.filter(User_Id=User_Id, Plan_Id=Plan_Id, Task_Id=Task_Id))
                    if rows:
                        rows[0].Status = "ai_cancelled"
                        rows[0].Input_Text = Input_Text
                        rows[0].Submitted_At = timezone.now()
                        rows[0].Is_Auto_Submitted = Is_Auto_Submitted
                        rows[0].save()
                    else:
                        period, day, task = _find_task(plan_row.Plan, Task_Id)
                        Task_Details.objects.create(
                            User_Id=User_Id, Plan_Id=Plan_Id, Task_Id=Task_Id,
                            Mode=plan_row.Mode, Level=plan_row.Level,
                            Period=period.get("period", "") if period else "",
                            Day=day.get("day", "") if day else "",
                            Title=task.get("title", "") if task else "",
                            Type=task.get("type", "") if task else "",
                            Status="ai_cancelled",
                            Input_Text=Input_Text,
                            Submitted_At=timezone.now(),
                            Is_Auto_Submitted=Is_Auto_Submitted,
                        )
                    _, _, task = _find_task(plan_row.Plan, Task_Id)
                    if task:
                        task["status"] = "cancelled"
                        plan_row.Plan = _json_safe(plan_row.Plan)
                        plan_row.save()
                except Exception as ae:
                    Logger.warning("Submit_Task AI cancel save failed: %s", ae)
                return Submit_Task_Text_Mutation(
                    Success=False,
                    AI_Detected=True,
                    AI_Confidence=round(ai_prob, 2),
                    Error=(
                        f"AI-generated content detected in your submission "
                        f"({ai_prob:.1f}% confidence). Task has been cancelled."
                    ),
                )

            # Run feedback pipeline
            try:
                analyzer = Get_Feedback_Analyzer()
                result = analyzer.Analyze_Text(Text=Input_Text)
            except Exception as fe:
                Logger.error("Feedback analysis failed: %s", fe)
                result = {
                    "overall_score": 75.0, "grammar_score": 70.0,
                    "vocab_score": 70.0, "punct_score": 70.0,
                    "corrected": Input_Text,
                    "detected_issues": ["Analysis temporarily unavailable"],
                }

            # Live CEFR classification of the submitted text
            classified_level = None
            classified_confidence = None
            try:
                from Classification.services.DistilBERT_Classifier import Get_Classifier
                clf_result = Get_Classifier().Classify_Text(Input_Text)
                classified_level = clf_result.get("level")
                classified_confidence = clf_result.get("confidence")
            except Exception as _ce:
                Logger.warning("CEFR classification of submitted text failed: %s", _ce)

            scores = {
                "overall_score":  result.get("overall_score", 0),
                "grammar_score":  result.get("grammar_score", 0),
                "vocab_score":    result.get("vocab_score", 0),
                "punct_score":    result.get("punct_score", 0),
                "spelling_score": result.get("spelling_score", 0),
                "classified_level": classified_level,
                "classified_confidence": classified_confidence,
            }
            material_quality = float(result.get("overall_score", 0) or 0)

            existing = None
            try:
                rows = list(Task_Details.objects.filter(User_Id=User_Id, Plan_Id=Plan_Id, Task_Id=Task_Id))
                existing = rows[0] if rows else None
            except Exception:
                pass

            if not existing:
                record = Task_Details.objects.create(
                    User_Id=User_Id,
                    Plan_Id=Plan_Id,
                    Task_Id=Task_Id,
                    Mode=plan_row.Mode,
                    Level=plan_row.Level,
                    Period=period.get("period", "") if period else "",
                    Day=day.get("day", "") if day else "",
                    Title=task.get("title", ""),
                    Type=task.get("type", ""),
                    Status="submitted",
                    Input_Text=Input_Text,
                    Corrected_Text=result.get("corrected", Input_Text),
                    Detected_Issues=result.get("detected_issues", []),
                    Scores=scores,
                    Feedback_Errors=result.get("errors", []),
                    Feedback_Error_Trend=result.get("error_trend", ""),
                    Feedback_Dominant_Error=result.get("dominant_error", ""),
                    Materials_Used=task.get("materials", []),
                    Material_Quality=material_quality,
                    Submitted_At=timezone.now(),
                    Is_Auto_Submitted=Is_Auto_Submitted,
                )
            else:
                record = existing
                record.Status = "submitted"
                record.Input_Text = Input_Text
                record.Corrected_Text = result.get("corrected", Input_Text)
                record.Detected_Issues = result.get("detected_issues", [])
                record.Scores = scores
                record.Feedback_Errors = result.get("errors", [])
                record.Feedback_Error_Trend = result.get("error_trend", "")
                record.Feedback_Dominant_Error = result.get("dominant_error", "")
                record.Materials_Used = task.get("materials", [])
                record.Material_Quality = material_quality
                record.Submitted_At = timezone.now()
                record.Is_Auto_Submitted = Is_Auto_Submitted
                record.save()

            # Persist status + feedback into plan JSON
            task["status"] = "submitted"
            task["corrected_text"] = result.get("corrected", Input_Text)
            task["mistakes"] = result.get("detected_issues", [])
            plan_row.Plan = _json_safe(plan_row.Plan)
            plan_row.save()

            recommendations_json = None  # resources shown on plan generation, not task submission

            return Submit_Task_Text_Mutation(
                Success=True,
                AI_Detected=False,
                Task=_convert_task_detail(record),
                Recommended_Resources=recommendations_json,
            )
        except Exception as e:
            Logger.exception("Submit_Task_Text error")
            return Submit_Task_Text_Mutation(Success=False, AI_Detected=False, Error=_err_msg(e))


class Update_Task_Status_Mutation(Mutation):
    class Arguments:
        User_Id = String(required=True)
        Plan_Id = String(required=True)
        Task_Id = String(required=True)
        Status = String(required=True)

    Success = Boolean()
    Error = String()

    @require_auth
    def mutate(self, info, User_Id, Plan_Id, Task_Id, Status):
        try:
            from bson import ObjectId
            plan_row = None
            try:
                rows = list(Personalized_Plan.objects.filter(_id=ObjectId(Plan_Id)))
                plan_row = rows[0] if rows else None
            except Exception:
                pass

            if not plan_row:
                return Update_Task_Status_Mutation(Success=False, Error="Plan not found")

            _, _, task = _find_task(plan_row.Plan, Task_Id)
            if not task:
                return Update_Task_Status_Mutation(Success=False, Error="Task not found in plan")

            task["status"] = Status
            plan_row.Plan = _json_safe(plan_row.Plan)
            plan_row.save()

            try:
                rows = list(Task_Details.objects.filter(User_Id=User_Id, Plan_Id=Plan_Id, Task_Id=Task_Id))
                if rows:
                    rows[0].Status = Status
                    rows[0].save()
            except Exception:
                pass

            return Update_Task_Status_Mutation(Success=True)
        except Exception as e:
            return Update_Task_Status_Mutation(Success=False, Error=_err_msg(e))


class Cancel_Task_Mutation(Mutation):
    class Arguments:
        User_Id  = String(required=True)
        Plan_Id  = String(required=True)
        Task_Id  = String(required=True)

    Success = Boolean()
    Error   = String()

    @require_auth
    def mutate(self, info, User_Id, Plan_Id, Task_Id):
        try:
            from bson import ObjectId
            plan_row = None
            try:
                rows = list(Personalized_Plan.objects.filter(_id=ObjectId(Plan_Id)))
                plan_row = rows[0] if rows else None
            except Exception:
                pass

            if not plan_row:
                return Cancel_Task_Mutation(Success=False, Error="Plan not found")

            _, _, task = _find_task(plan_row.Plan, Task_Id)
            if task:
                task["status"] = "cancelled"
                plan_row.Plan = _json_safe(plan_row.Plan)
                plan_row.save()

            # Upsert Task_Details record as cancelled
            try:
                rows = list(Task_Details.objects.filter(User_Id=User_Id, Plan_Id=Plan_Id, Task_Id=Task_Id))
                if rows:
                    rows[0].Status = "cancelled"
                    rows[0].save()
                else:
                    period, day, t = _find_task(plan_row.Plan, Task_Id) if plan_row else (None, None, None)
                    Task_Details.objects.create(
                        User_Id=User_Id,
                        Plan_Id=Plan_Id,
                        Task_Id=Task_Id,
                        Mode=plan_row.Mode if plan_row else "",
                        Level=plan_row.Level if plan_row else "",
                        Period=period.get("period", "") if period else "",
                        Day=day.get("day", "") if day else "",
                        Title=t.get("title", "") if t else "",
                        Type=t.get("type", "") if t else "",
                        Status="cancelled",
                    )
            except Exception as te:
                Logger.warning("Cancel_Task: Task_Details upsert failed: %s", te)

            return Cancel_Task_Mutation(Success=True)
        except Exception as e:
            Logger.exception("Cancel_Task error")
            return Cancel_Task_Mutation(Success=False, Error=_err_msg(e))


class Reset_Task_Mutation(Mutation):
    """Reset a task back to 'todo' so the user can attempt it again."""
    class Arguments:
        User_Id = String(required=True)
        Plan_Id = String(required=True)
        Task_Id = String(required=True)

    Success = Boolean()
    Error   = String()

    @require_auth
    def mutate(self, info, User_Id, Plan_Id, Task_Id):
        try:
            from bson import ObjectId
            plan_row = None
            try:
                rows = list(Personalized_Plan.objects.filter(_id=ObjectId(Plan_Id)))
                plan_row = rows[0] if rows else None
            except Exception:
                pass

            if not plan_row:
                return Reset_Task_Mutation(Success=False, Error="Plan not found")

            _, _, task = _find_task(plan_row.Plan, Task_Id)
            if task:
                task["status"] = "todo"
                # Clear stored feedback from plan JSON so frontend gets a clean state
                task.pop("corrected_text", None)
                task.pop("mistakes", None)
                plan_row.Plan = _json_safe(plan_row.Plan)
                plan_row.save()

            # Delete the Task_Details record so old scores don't persist
            try:
                rows = list(Task_Details.objects.filter(User_Id=User_Id, Plan_Id=Plan_Id, Task_Id=Task_Id))
                for r in rows:
                    r.delete()
            except Exception as te:
                Logger.warning("Reset_Task: Task_Details delete failed: %s", te)

            return Reset_Task_Mutation(Success=True)
        except Exception as e:
            Logger.exception("Reset_Task error")
            return Reset_Task_Mutation(Success=False, Error=_err_msg(e))


class Fetch_Task_Examples_Mutation(Mutation):
    class Arguments:
        Task_Type = String(required=True)
        Skill = String(required=True)
        Level = String(required=True)
        Limit = Int(default_value=3)

    Success = Boolean()
    Examples = List(Example_Type)
    Error = String()

    def mutate(self, info, Task_Type, Skill, Level, Limit=3):
        try:
            examples = []
            seen_wrongs = set()   # deduplication

            level_upper = (Level or "").upper()
            if level_upper in ("A1", "A2"):
                cefr_levels = ["A1", "A2"]
            elif level_upper in ("B1", "B2"):
                cefr_levels = ["B1", "B2"]
            else:
                cefr_levels = ["C1", "C2"]

            correction_query = f"{Skill} error correction grammar fix writing"
            results = _atlas_vector_search(correction_query, cefr_levels, top_k=Limit * 3)

            for r in results:
                if len(examples) >= Limit:
                    break

                text = r.get("text", "")
                chunk_type = r.get("chunk_type", "")

                original = corrected = ""

                if chunk_type == "error_correction" and "Original:" in text and "Corrected:" in text:
                    orig_m = re.search(r"Original:\s*(.+?)\nCorrected:", text, re.S)
                    corr_m = re.search(r"Corrected:\s*(.+?)(?:\n|$)", text, re.S)
                    original = _strip_instruction_prefix(_clean_text(orig_m.group(1))) if orig_m else ""
                    corrected = _clean_text(corr_m.group(1)) if corr_m else ""

                elif "Instruction: gec" in text or "Fix the grammatical" in text or "Fix grammar" in text:
                    orig_m = re.search(r"(?:Fix[^:]*:\s*)(.+?)\n.*?Corrected:\s*(.+?)(?:\n|$)", text, re.S)
                    if orig_m:
                        original = _strip_instruction_prefix(_clean_text(orig_m.group(1)))
                        corrected = _clean_text(orig_m.group(2))
                    else:
                        orig_m = re.search(r"Original:\s*(.+?)\nCorrected:", text, re.S)
                        corr_m = re.search(r"Corrected:\s*(.+?)(?:\n|$)", text, re.S)
                        original = _strip_instruction_prefix(_clean_text(orig_m.group(1))) if orig_m else ""
                        corrected = _clean_text(corr_m.group(1)) if corr_m else ""

                if original and corrected:
                    min_words = _min_words_for_level(Level)
                    if len(original.split()) < min_words or len(corrected.split()) < min_words:
                        continue

                    # Deduplicate by normalised original sentence
                    key = original.lower().strip()
                    if key in seen_wrongs:
                        continue
                    seen_wrongs.add(key)

                    explanation, tags = _build_explanation(original, corrected, Level)
                    if not explanation:
                        continue

                    examples.append(Example_Type(
                        Type="error_correction",
                        Wrong=original,
                        Correct=corrected,
                        Explanation=explanation,
                        Tags=tags or [],
                        Source=r.get("source", "Grammar Resource"),
                        Url=r.get("url", ""),
                    ))

            # Pad with concept explanations if not enough
            if len(examples) < 2:
                concept_results = _atlas_vector_search(
                    f"{Task_Type} {Skill} writing guide explanation",
                    cefr_levels, top_k=3,
                )
                for r in concept_results:
                    if len(examples) >= Limit:
                        break
                    text = r.get("text", "")
                    if len(text) > 100 and r.get("chunk_type", "") != "error_correction":
                        examples.append(Example_Type(
                            Type="concept",
                            Content=text[:600],
                            Source=r.get("source", "Writing Guide"),
                            Url=r.get("url", ""),
                        ))

            return Fetch_Task_Examples_Mutation(Success=True, Examples=examples[:Limit])
        except Exception as e:
            Logger.exception("Fetch_Task_Examples error")
            return Fetch_Task_Examples_Mutation(Success=False, Error=_err_msg(e))


class Generate_Task_Learn_Fields_Mutation(Mutation):
    """Generate AI explanation + correction_reason for a given error/correction pair."""
    class Arguments:
        Example_Error       = String(required=True)
        Example_Correction  = String(required=True)
        Skills              = List(String, default_value=[])
        Level               = String(default_value="B1")

    Success          = Boolean()
    Explanation      = String()
    Correction_Reason = String()
    Error            = String()

    def mutate(self, info, Example_Error, Example_Correction, Skills=None, Level="B1"):
        try:
            from Personalized_Plan.services.Plan_Generator import generate_task_learn_fields
            result = generate_task_learn_fields(
                example_error=Example_Error,
                example_correction=Example_Correction,
                skills=Skills or [],
                level=Level,
            )
            return Generate_Task_Learn_Fields_Mutation(
                Success=True,
                Explanation=result.get("explanation", ""),
                Correction_Reason=result.get("correction_reason", ""),
            )
        except Exception as e:
            Logger.exception("Generate_Task_Learn_Fields error")
            return Generate_Task_Learn_Fields_Mutation(Success=False, Error=_err_msg(e))


# ── Queries ────────────────────────────────────────────────────────────────────

class Query(ObjectType):
    Get_Plan_History = List(
        Plan_History_Item,
        User_Id=String(required=True),
        Limit=Int(default_value=5),
    )
    Get_Active_Plan = Field(
        Active_Plan_Item,
        User_Id=String(required=True),
        Mode=String(required=True),
    )
    Get_Task_Details = Field(
        Task_Detail_Type,
        User_Id=String(required=True),
        Plan_Id=String(required=True),
        Task_Id=String(required=True),
    )
    Get_Task_History = List(
        Task_Detail_Type,
        User_Id=String(required=True),
        Plan_Id=String(required=True),
        Limit=Int(default_value=50),
    )
    Get_Plan_Summary = Field(
        Plan_Summary_Type,
        User_Id=String(required=True),
        Mode=String(required=True),
    )
    Get_User_Streak = Field(
        graphene.JSONString,
        User_Id=String(required=True),
    )
    Get_User_Activity_Dates = List(
        String,
        User_Id=String(required=True),
        Days=Int(default_value=120),
        Mode=String(),
    )

    @require_auth
    def resolve_Get_Plan_History(self, info, User_Id, Limit=5):
        try:
            items = list(Personalized_Plan.objects.filter(User_Id=User_Id).order_by("-Created_At")[:Limit])
            return [
                Plan_History_Item(
                    Id=str(p._id),
                    Mode=p.Mode,
                    Level=p.Level,
                    Created_At=str(p.Created_At),
                    Plan=_to_json_string(p.Plan),
                )
                for p in items
            ]
        except Exception:
            Logger.exception("Get_Plan_History error")
            return []

    @require_auth
    def resolve_Get_Active_Plan(self, info, User_Id, Mode):
        try:
            row = _get_active_plan_row(User_Id, Mode)
            if not row:
                return None

            # Sync task statuses from Task_Details so the plan JSON is authoritative
            plan_dirty = False
            try:
                plan_id_str = str(row._id)
                details = list(Task_Details.objects.filter(User_Id=User_Id, Plan_Id=plan_id_str))
                detail_map = {d.Task_Id: d for d in details}
                for period in (row.Plan or {}).get("plan", []):
                    for day in period.get("days", []):
                        for task in day.get("tasks", []):
                            tid = task.get("task_id")
                            d = detail_map.get(tid)
                            if not d:
                                continue
                            plan_status = "cancelled" if d.Status == "ai_cancelled" else d.Status
                            if plan_status in ("submitted", "reviewed", "cancelled"):
                                if task.get("status") != plan_status:
                                    task["status"] = plan_status
                                    plan_dirty = True
                if plan_dirty:
                    row.Plan = _json_safe(row.Plan)
                    row.save()
            except Exception as sync_err:
                Logger.warning("resolve_Get_Active_Plan status sync error: %s", sync_err)

            return Active_Plan_Item(
                Id=str(row._id),
                Mode=row.Mode,
                Level=row.Level,
                Created_At=str(row.Created_At),
                Updated_At=str(row.Updated_At),
                Is_Active=row.Is_Active,
                Current_Period_Index=row.Current_Period_Index,
                Plan=_to_json_string(row.Plan),
                Source_Exam_Id=row.Source_Exam_Id or '',
            )
        except Exception:
            Logger.exception("Get_Active_Plan error")
            return None

    @require_auth
    def resolve_Get_Task_Details(self, info, User_Id, Plan_Id, Task_Id):
        try:
            rows = list(Task_Details.objects.filter(User_Id=User_Id, Plan_Id=Plan_Id, Task_Id=Task_Id))
            return _convert_task_detail(rows[0]) if rows else None
        except Exception:
            Logger.exception("Get_Task_Details error")
            return None

    @require_auth
    def resolve_Get_Task_History(self, info, User_Id, Plan_Id, Limit=50):
        try:
            rows = _get_task_details_for_plan(User_Id, Plan_Id)
            rows = sorted(rows, key=lambda r: r.Created_At, reverse=True)[:Limit]
            return [_convert_task_detail(r) for r in rows]
        except Exception:
            Logger.exception("Get_Task_History error")
            return []

    @require_auth
    def resolve_Get_Plan_Summary(self, info, User_Id, Mode):
        try:
            active = _get_active_plan_row(User_Id, Mode)
            if not active:
                return Plan_Summary_Type(
                    Has_Active_Plan=False, Level="", Mode=Mode,
                    Progress_Pct=0, Completed_Tasks=0, Total_Tasks=0,
                    Focus_Skills=[], Today_Tasks=[], Current_Streak=0, Ends_At=None,
                )

            plan_json = active.Plan or {}
            plan_id = str(active._id)

            # Load task details (simple equality filter — djongo safe)
            task_details = _get_task_details_for_plan(User_Id, plan_id)
            task_map = {t.Task_Id: t for t in task_details}

            total = completed = 0
            for period in plan_json.get("plan", []):
                for day in period.get("days", []):
                    for t in day.get("tasks", []):
                        total += 1
                        tid = t.get("task_id", "")
                        db = task_map.get(tid)
                        status = db.Status if db else t.get("status", "todo")
                        if status in ("submitted", "reviewed"):
                            completed += 1

            pct = round(completed / total * 100) if total else 0
            today_raw = _get_today_tasks_from_plan(plan_json, active.Current_Period_Index, task_map)
            today_tasks = [
                Today_Task_Type(
                    Task_Id=t["Task_Id"], Title=t["Title"], Type=t["Type"],
                    Estimated_Minutes=t["Estimated_Minutes"], Status=t["Status"],
                )
                for t in today_raw
            ]
            current_streak = _compute_streak(User_Id)

            return Plan_Summary_Type(
                Has_Active_Plan=True,
                Level=active.Level,
                Mode=active.Mode,
                Progress_Pct=pct,
                Completed_Tasks=completed,
                Total_Tasks=total,
                Focus_Skills=plan_json.get("focus_skills", []),
                Today_Tasks=today_tasks,
                Current_Streak=current_streak,
                Ends_At=str(active.Ends_At) if active.Ends_At else None,
            )
        except Exception:
            Logger.exception("Get_Plan_Summary error")
            return Plan_Summary_Type(
                Has_Active_Plan=False, Mode=Mode, Focus_Skills=[], Today_Tasks=[]
            )

    @require_auth
    def resolve_Get_User_Activity_Dates(self, info, User_Id, Days=120, Mode=None):
        """Return ISO date strings (YYYY-MM-DD) for days the user completed tasks.
        When Mode is given, only counts tasks belonging to the active plan of that mode."""
        try:
            cutoff_aware = datetime.now(dt_timezone.utc) - timedelta(days=Days)
            cutoff_naive = cutoff_aware.replace(tzinfo=None)

            qs = Task_Details.objects.filter(
                User_Id=User_Id,
                Status__in=["submitted", "reviewed"],
            )

            # Narrow to tasks from the user's active plan for the given mode
            if Mode:
                try:
                    active_plan = Personalized_Plan.objects.filter(
                        User_Id=User_Id,
                        Mode=Mode,
                        Is_Active=True,
                    ).order_by("-Created_At").first()
                    if active_plan:
                        qs = qs.filter(Plan_Id=str(active_plan._id))
                    else:
                        return []
                except Exception as pe:
                    Logger.warning("Could not resolve active plan for mode %s: %s", Mode, pe)

            tasks = list(qs)
            dates = set()
            for t in tasks:
                dt = t.Submitted_At or t.Created_At
                if not dt:
                    continue
                # Normalize to naive for comparison (djongo stores naive datetimes)
                dt_naive = dt.replace(tzinfo=None) if dt.tzinfo else dt
                if dt_naive >= cutoff_naive:
                    dates.add(dt_naive.date().isoformat())
            return sorted(dates)
        except Exception:
            Logger.exception("Get_User_Activity_Dates error")
            return []

    @require_auth
    def resolve_Get_User_Streak(self, info, User_Id):
        try:
            current = _compute_streak(User_Id)
            return json.dumps({
                "Current_Streak": current,
                "Longest_Streak": current,
                "Last_Active_Date": None,
                "Total_Days_Active": 0,
            })
        except Exception:
            Logger.exception("Get_User_Streak error")
            return json.dumps({"Current_Streak": 0, "Longest_Streak": 0,
                               "Last_Active_Date": None, "Total_Days_Active": 0})


# ── Mutation root ──────────────────────────────────────────────────────────────

class Mutation(ObjectType):
    Generate_Plan = Generate_Plan_Mutation.Field()
    Generate_Next_Plan = Generate_Next_Plan_Mutation.Field()
    Adjust_Plan = Adjust_Plan_Mutation.Field()
    Save_Plan = Save_Plan_Mutation.Field()
    Mark_Plan_Period_Done = Mark_Plan_Period_Done_Mutation.Field()
    Start_Task = Start_Task_Mutation.Field()
    Submit_Task_Text = Submit_Task_Text_Mutation.Field()
    Update_Task_Status = Update_Task_Status_Mutation.Field()
    Cancel_Task = Cancel_Task_Mutation.Field()
    Reset_Task = Reset_Task_Mutation.Field()
    Fetch_Task_Examples = Fetch_Task_Examples_Mutation.Field()
    Generate_Task_Learn_Fields = Generate_Task_Learn_Fields_Mutation.Field()


Schema = graphene.Schema(query=Query, mutation=Mutation)