import json
import logging
import re
import difflib
import graphene
from graphene import ObjectType, String, Boolean, Field, Mutation, Int, List
from django.utils import timezone
from datetime import datetime, date, timezone as dt_timezone, timedelta

from .models import Personalized_Plan, Task_Details
from .services.Plan_Generator import Generate_Plan
from .services.Plan_Adjuster import Adjust_Plan
from .services.Plan_Validator import validate_plan
from Classification.models import Classification_Level
from Feedback.models import Feedback_Result
from Feedback.services.Feedback_Model import Get_Feedback_Analyzer


Logger = logging.getLogger(__name__)

DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


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


class Task_Detail_Type(ObjectType):
    Id = String()
    User_Id = String()
    Plan_Id = String()
    Task_Id = String()
    Mode = String()
    Level = String()
    Period = String()
    Day = String()
    Title = String()
    Type = String()
    Status = String()
    Input_Text = String()
    Corrected_Text = String()
    Detected_Issues = graphene.JSONString()
    Scores = graphene.JSONString()
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

def _has_new_progress(user_id, since_dt):
    """Check if any classification or feedback exists after since_dt.
    Loads all records for user and filters in Python to avoid djongo __gt bug."""
    if since_dt is None:
        return True
    try:
        for c in Classification_Level.objects.filter(User_Id=user_id).order_by("-Created_At")[:20]:
            if c.Created_At and c.Created_At > since_dt:
                return True
        for f in Feedback_Result.objects.filter(User_Id=user_id).order_by("-Created_At")[:20]:
            if f.Created_At and f.Created_At > since_dt:
                return True
    except Exception:
        pass
    return False


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
                return r
    except Exception as e:
        Logger.warning("_get_active_plan_row error: %s", e)
    return None


def _save_new_plan(user_id, mode, plan):
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
    return Task_Detail_Type(
        Id=str(model._id),
        User_Id=model.User_Id,
        Plan_Id=model.Plan_Id,
        Task_Id=model.Task_Id,
        Mode=model.Mode,
        Level=model.Level,
        Period=model.Period,
        Day=model.Day,
        Title=model.Title,
        Type=model.Type,
        Status=model.Status,
        Input_Text=model.Input_Text,
        Corrected_Text=model.Corrected_Text,
        Detected_Issues=_to_json_string(model.Detected_Issues),
        Scores=_to_json_string(model.Scores),
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

class Generate_Plan_Mutation(Mutation):
    class Arguments:
        User_Id = String(required=True)
        Mode = String(required=True)
        Level = String(required=False)
        Save_To_Database = Boolean(default_value=True)

    Success = Boolean()
    Plan = Field(Plan_Type)
    Error = String()

    def mutate(self, info, User_Id, Mode, Level=None, Save_To_Database=True):
        try:
            plan = Generate_Plan(User_Id=User_Id, Mode=Mode, Level=Level)
            validate_plan(plan)
            plan = _json_safe(plan)
            if Save_To_Database:
                _save_new_plan(User_Id, Mode, plan)
            return Generate_Plan_Mutation(Success=True, Plan=Plan_Type(Data=_to_json_string(plan)))
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

    def mutate(self, info, User_Id, Mode):
        try:
            active = _get_active_plan_row(User_Id, Mode)
            if active:
                return Generate_Next_Plan_Mutation(
                    Success=True,
                    Plan=Plan_Type(Data=_to_json_string(active.Plan)),
                    Status="already_active",
                )

            try:
                rows = list(Personalized_Plan.objects.filter(User_Id=User_Id, Mode=Mode).order_by("-Created_At")[:1])
                latest = rows[0] if rows else None
            except Exception:
                latest = None

            # No plan at all — generate first one
            if not latest:
                plan = Generate_Plan(User_Id=User_Id, Mode=Mode, Level=None)
                validate_plan(plan)
                plan = _json_safe(plan)
                _save_new_plan(User_Id, Mode, plan)
                return Generate_Next_Plan_Mutation(
                    Success=True,
                    Plan=Plan_Type(Data=_to_json_string(plan)),
                    Status="generated_first_plan",
                )

            plan_generated_at = _parse_iso((latest.Plan or {}).get("generated_at")) or latest.Created_At
            if _has_new_progress(User_Id, plan_generated_at):
                plan = Generate_Plan(User_Id=User_Id, Mode=Mode, Level=None)
                validate_plan(plan)
                plan = _json_safe(plan)
                _save_new_plan(User_Id, Mode, plan)
                return Generate_Next_Plan_Mutation(
                    Success=True,
                    Plan=Plan_Type(Data=_to_json_string(plan)),
                    Status="generated_new_plan",
                )

            return Generate_Next_Plan_Mutation(
                Success=True, Plan=None, Status="waiting_for_progress"
            )
        except Exception as e:
            Logger.exception("Generate_Next_Plan failed")
            return Generate_Next_Plan_Mutation(Success=False, Error=_err_msg(e))


class Adjust_Plan_Mutation(Mutation):
    class Arguments:
        User_Id = String(required=True)
        Instruction = String(required=True)
        Current_Plan = String(required=True)
        Selected_Period_Index = Int(default_value=0)
        Selected_Day_Index = Int()

    Success = Boolean()
    Plan = Field(Plan_Type)
    Error = String()

    def mutate(self, info, User_Id, Instruction, Current_Plan, Selected_Period_Index=0, Selected_Day_Index=None):
        try:
            try:
                current_plan_data = json.loads(Current_Plan)
            except json.JSONDecodeError as e:
                return Adjust_Plan_Mutation(Success=False, Error=f"Invalid plan JSON: {e}")

            updated_plan = Adjust_Plan(
                current_plan=current_plan_data,
                instruction=Instruction,
                selected_period_index=Selected_Period_Index,
                selected_day_index=Selected_Day_Index,
            )
            updated_plan = _json_safe(updated_plan)
            return Adjust_Plan_Mutation(Success=True, Plan=Plan_Type(Data=_to_json_string(updated_plan)))
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

            if current_idx < len(plan_list) - 1:
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

            # Last period done
            plan_row.Is_Active = False
            plan_row.Completed_At = timezone.now()
            plan_row.Current_Period_Index = len(plan_list) - 1
            plan["current_period_index"] = len(plan_list) - 1
            plan_row.Plan = _json_safe(plan)
            plan_row.save()

            plan_generated_at = _parse_iso(plan.get("generated_at")) or plan_row.Created_At
            if _has_new_progress(User_Id, plan_generated_at):
                new_plan = Generate_Plan(User_Id=User_Id, Mode=Mode, Level=None)
                validate_plan(new_plan)
                new_plan = _json_safe(new_plan)
                _save_new_plan(User_Id, Mode, new_plan)
                return Mark_Plan_Period_Done_Mutation(
                    Success=True,
                    Plan=Plan_Type(Data=_to_json_string(new_plan)),
                    Status="new_plan_generated",
                )

            return Mark_Plan_Period_Done_Mutation(Success=True, Plan=None, Status="waiting_for_progress")
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
                    Started_At=started_at,
                    Ends_At=ends_at,
                    Materials_Used=task.get("materials", []),
                )
            else:
                record = existing
                record.Status = "in_progress"
                record.Started_At = started_at
                record.Ends_At = ends_at
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
    Error = String()

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

            period, day, task = _find_task(plan_row.Plan, Task_Id)
            if not task:
                return Submit_Task_Text_Mutation(Success=False, Error=f"Task not found: {Task_Id}")

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

            scores = {
                "overall_score": result.get("overall_score", 0),
                "grammar_score": result.get("grammar_score", 0),
                "vocab_score":   result.get("vocab_score", 0),
                "punct_score":   result.get("punct_score", 0),
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

            return Submit_Task_Text_Mutation(Success=True, Task=_convert_task_detail(record))
        except Exception as e:
            Logger.exception("Submit_Task_Text error")
            return Submit_Task_Text_Mutation(Success=False, Error=_err_msg(e))


class Update_Task_Status_Mutation(Mutation):
    class Arguments:
        User_Id = String(required=True)
        Plan_Id = String(required=True)
        Task_Id = String(required=True)
        Status = String(required=True)

    Success = Boolean()
    Error = String()

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

    def resolve_Get_Active_Plan(self, info, User_Id, Mode):
        try:
            row = _get_active_plan_row(User_Id, Mode)
            if not row:
                return None
            return Active_Plan_Item(
                Id=str(row._id),
                Mode=row.Mode,
                Level=row.Level,
                Created_At=str(row.Created_At),
                Updated_At=str(row.Updated_At),
                Is_Active=row.Is_Active,
                Current_Period_Index=row.Current_Period_Index,
                Plan=_to_json_string(row.Plan),
            )
        except Exception:
            Logger.exception("Get_Active_Plan error")
            return None

    def resolve_Get_Task_Details(self, info, User_Id, Plan_Id, Task_Id):
        try:
            rows = list(Task_Details.objects.filter(User_Id=User_Id, Plan_Id=Plan_Id, Task_Id=Task_Id))
            return _convert_task_detail(rows[0]) if rows else None
        except Exception:
            Logger.exception("Get_Task_Details error")
            return None

    def resolve_Get_Task_History(self, info, User_Id, Plan_Id, Limit=50):
        try:
            rows = _get_task_details_for_plan(User_Id, Plan_Id)
            rows = sorted(rows, key=lambda r: r.Created_At, reverse=True)[:Limit]
            return [_convert_task_detail(r) for r in rows]
        except Exception:
            Logger.exception("Get_Task_History error")
            return []

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
    Fetch_Task_Examples = Fetch_Task_Examples_Mutation.Field()


Schema = graphene.Schema(query=Query, mutation=Mutation)