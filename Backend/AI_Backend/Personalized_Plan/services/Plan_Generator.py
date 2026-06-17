import os
import re
import json
import logging
from datetime import datetime, timedelta
from urllib import request

from pymongo import MongoClient
from Classification.models import Classification_Level
from Feedback.models import Feedback_Result

Logger = logging.getLogger(__name__)

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

    return profile


def _embed_text(text):
    from sentence_transformers import SentenceTransformer

    model_name = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    model = SentenceTransformer(model_name)
    return model.encode(text).tolist()


def _atlas_vector_search(query_text, cefr_levels, top_k=12):
    mongo_uri = os.getenv("MONGODB_URI") or os.getenv("MONGO_URL")
    if not mongo_uri:
        Logger.warning("MongoDB URI not found, returning empty chunks")
        return []

    db_name = os.getenv("MONGODB_DB", "Rag")
    collection_name = os.getenv("RAG_COLLECTION", "Chunks")
    index_name = os.getenv("RAG_VECTOR_INDEX", "rag_vector_index")

    try:
        client = MongoClient(mongo_uri)
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


def _build_prompt(level, mode, feedback_profile, retrieved_chunks):
    """Build prompt for a single-week (weekly) plan."""
    chunk_block = ""
    for i, c in enumerate(retrieved_chunks[:6], start=1):
        chunk_block += (
            f"[CHUNK {i} | {c.get('chunk_type', 'general')} | {c.get('source', 'material')} | {c.get('cefr_level', level)}]\n"
            f"{_truncate_chunk_text(c.get('text', ''))}\n---\n"
        )

    weak_skills = feedback_profile.get("weak_skills", ["writing"])
    weak_skills_str = ", ".join(weak_skills) if weak_skills else "general writing"
    issue_terms = ", ".join(sorted(set(feedback_profile.get("recent_issues") or [])))

    return f"""You are a CEFR-aligned English writing tutor. Return STRICT JSON only.

Student level: {level}
Mode: {mode}
Focus skills: {weak_skills_str}
Recent issues: {issue_terms if issue_terms else "none"}

Generate a weekly study plan with exactly 7 days (Sunday to Saturday).
**CRITICAL: For each day, create 2-3 writing tasks appropriate for CEFR {level} level.**

Each task MUST have ALL these fields:
- task_id: unique ID like "sun_task_1", "mon_task_1", etc.
- title: Short descriptive title (max 15 words)
- prompt: Detailed writing prompt (50-100 words) that asks the student to write something
- type: "writing_task"
- estimated_minutes: Integer between 15 and 60
- skills: List of skills this task targets (e.g., ["grammar", "punctuation"])
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
        {{"day": "Sunday", "tasks": [TASK_OBJECT_1, TASK_OBJECT_2]}},
        {{"day": "Monday", "tasks": [TASK_OBJECT_1, TASK_OBJECT_2]}},
        {{"day": "Tuesday", "tasks": [TASK_OBJECT_1, TASK_OBJECT_2]}},
        {{"day": "Wednesday", "tasks": [TASK_OBJECT_1, TASK_OBJECT_2]}},
        {{"day": "Thursday", "tasks": [TASK_OBJECT_1, TASK_OBJECT_2]}},
        {{"day": "Friday", "tasks": [TASK_OBJECT_1, TASK_OBJECT_2, TASK_OBJECT_3]}},
        {{"day": "Saturday", "tasks": [TASK_OBJECT_1, TASK_OBJECT_2]}}
      ]
    }}
  ]
}}

**IMPORTANT**:
- Sunday through Saturday must each have at least 2 tasks
- Use the material chunks below for inspiration but create original tasks
- Keep tasks appropriate for {level} level learners

Educational material for inspiration:
{chunk_block}

Return ONLY the JSON object, no other text, no markdown."""


def _build_week_prompt(level, feedback_profile, retrieved_chunks, week_num, total_weeks):
    """Build a prompt that generates a single week period for a monthly plan."""
    chunk_block = ""
    for i, c in enumerate(retrieved_chunks[:6], start=1):
        chunk_block += (
            f"[CHUNK {i} | {c.get('chunk_type', 'general')} | {c.get('source', 'material')} | {c.get('cefr_level', level)}]\n"
            f"{_truncate_chunk_text(c.get('text', ''))}\n---\n"
        )

    weak_skills = feedback_profile.get("weak_skills", ["writing"])
    weak_skills_str = ", ".join(weak_skills) if weak_skills else "general writing"
    issue_terms = ", ".join(sorted(set(feedback_profile.get("recent_issues") or [])))
    prefix = f"w{week_num}"

    if week_num == 1:
        progression = "Introduce the core concepts and build foundational skills."
    elif week_num == total_weeks:
        progression = "Consolidate and review all skills covered in previous weeks."
    else:
        progression = f"Build on Week {week_num - 1} — increase complexity and variety."

    return f"""You are a CEFR-aligned English writing tutor. Return STRICT JSON only.

Student level: {level}
Monthly plan — generating Week {week_num} of {total_weeks}
Focus skills: {weak_skills_str}
Recent issues: {issue_terms if issue_terms else "none"}
Progression note: {progression}

Generate ONLY Week {week_num} covering exactly 7 days (Sunday to Saturday).
**CRITICAL: For each day, create 2-3 writing tasks appropriate for CEFR {level} level.**

Each task MUST have ALL these fields:
- task_id: unique ID prefixed with "{prefix}_" e.g. "{prefix}_sun_task_1", "{prefix}_mon_task_1"
- title: Short descriptive title (max 15 words)
- prompt: Detailed writing prompt (50-100 words) that asks the student to write something
- type: "writing_task"
- estimated_minutes: Integer between 15 and 60
- skills: List of skills this task targets (e.g., ["grammar", "punctuation"])
- materials: List of materials, each with title, url, source

Return a JSON object with this exact structure (a single period — do NOT wrap in a plan array):
{{
  "period": "Week {week_num}",
  "days": [
    {{"day": "Sunday",    "tasks": [TASK_OBJECT_1, TASK_OBJECT_2]}},
    {{"day": "Monday",    "tasks": [TASK_OBJECT_1, TASK_OBJECT_2]}},
    {{"day": "Tuesday",   "tasks": [TASK_OBJECT_1, TASK_OBJECT_2]}},
    {{"day": "Wednesday", "tasks": [TASK_OBJECT_1, TASK_OBJECT_2]}},
    {{"day": "Thursday",  "tasks": [TASK_OBJECT_1, TASK_OBJECT_2]}},
    {{"day": "Friday",    "tasks": [TASK_OBJECT_1, TASK_OBJECT_2, TASK_OBJECT_3]}},
    {{"day": "Saturday",  "tasks": [TASK_OBJECT_1, TASK_OBJECT_2]}}
  ]
}}

**IMPORTANT**:
- Sunday through Saturday must each have at least 2 tasks
- Use the material chunks below for inspiration but create original tasks
- Keep tasks appropriate for {level} level learners

Educational material for inspiration:
{chunk_block}

Return ONLY the JSON object for this single week period, no other text, no markdown."""


def _call_openrouter(prompt):
    base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    api_key = os.getenv("OPENROUTER_API_KEY")
    model = os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash")
    referer = os.getenv("OPENROUTER_HTTP_REFERER", "http://localhost:8000")
    app_name = os.getenv("OPENROUTER_APP_NAME", "EWC-AI-Backend")

    if not api_key:
        Logger.error("OPENROUTER_API_KEY is not set")
        raise ValueError("OPENROUTER_API_KEY environment variable is required")

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Return strict JSON only. No markdown. No extra text outside the JSON object."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.4,
        "max_tokens": 4000,
    }

    req = request.Request(
        url=f"{base_url}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
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


def _generate_fallback_tasks_for_day(day_name, level, weak_skills, issues):
    """Generate fallback tasks if AI fails to generate"""
    level_num = LEVELS.index(level) if level in LEVELS else 0
    primary_skill = (weak_skills or ["writing"])[:1][0]
    issue_pool = [i for i in (issues or []) if isinstance(i, str)]
    issue_hint = ", ".join(issue_pool[:3]) if issue_pool else "common errors"
    
    # Task templates by level
    templates = {
        "A1": [
            {
                "title": f"Simple Sentences: {primary_skill.title()}",
                "prompt": f"Write 3-4 short sentences about your {day_name}. Focus on {primary_skill}. Avoid {issue_hint}.",
                "estimated_minutes": 20,
                "skills": [primary_skill, "basic sentences"]
            },
            {
                "title": "Fix Common Errors",
                "prompt": f"Rewrite 5 short sentences to fix {issue_hint}. Keep each sentence simple.",
                "estimated_minutes": 15,
                "skills": [primary_skill, "error correction"]
            }
        ],
        "A2": [
            {
                "title": f"Guided Paragraph: {primary_skill.title()}",
                "prompt": f"Write 60-80 words about {day_name}. Focus on {primary_skill}. Watch for {issue_hint}.",
                "estimated_minutes": 25,
                "skills": [primary_skill, "sequencing"]
            },
            {
                "title": "Error Correction Practice",
                "prompt": f"Correct 6-8 sentences focused on {primary_skill}. Pay attention to {issue_hint}.",
                "estimated_minutes": 25,
                "skills": [primary_skill, "error correction"]
            }
        ],
        "B1": [
            {
                "title": f"Focused Writing: {primary_skill.title()}",
                "prompt": f"Write 100-120 words about a {day_name} experience. Use {primary_skill} correctly and avoid {issue_hint}.",
                "estimated_minutes": 35,
                "skills": [primary_skill, "descriptive writing"]
            },
            {
                "title": "Targeted Revision",
                "prompt": f"Revise a short paragraph to fix {issue_hint}. Explain 2 changes you made.",
                "estimated_minutes": 30,
                "skills": [primary_skill, "revision"]
            }
        ],
        "B2": [
            {
                "title": f"Precision Writing: {primary_skill.title()}",
                "prompt": f"Write 120-150 words about {day_name}. Prioritize {primary_skill} accuracy and address {issue_hint}.",
                "estimated_minutes": 40,
                "skills": [primary_skill, "transitions"]
            },
            {
                "title": "Error-Focused Revision",
                "prompt": f"Rewrite a paragraph to eliminate {issue_hint}. Keep the meaning but improve accuracy.",
                "estimated_minutes": 40,
                "skills": [primary_skill, "revision"]
            }
        ],
        "C1": [
            {
                "title": f"Advanced Accuracy: {primary_skill.title()}",
                "prompt": f"Write 150-200 words analyzing your {day_name}. Focus on {primary_skill} and avoid {issue_hint}.",
                "estimated_minutes": 50,
                "skills": [primary_skill, "critical thinking"]
            },
            {
                "title": "Revision With Rationale",
                "prompt": f"Revise a formal paragraph to fix {issue_hint}. Add 2 sentences explaining your edits.",
                "estimated_minutes": 55,
                "skills": [primary_skill, "revision"]
            }
        ]
    }
    
    # Get appropriate level templates (or nearest lower)
    level_group = level
    while level_group not in templates and LEVELS.index(level_group) > 0:
        level_group = LEVELS[LEVELS.index(level_group) - 1]
    if level_group not in templates:
        level_group = "B1"
    
    task_templates = templates[level_group]
    tasks = []
    
    for idx, template in enumerate(task_templates, 1):
        task_id = f"{day_name.lower()[:3]}_task_{idx}"
        tasks.append({
            "task_id": task_id,
            "title": template["title"],
            "prompt": template["prompt"],
            "type": "writing_task",
            "estimated_minutes": template["estimated_minutes"],
            "skills": template["skills"],
            "status": "todo",
            "materials": [
                {
                    "title": f"Writing Tips for {level} Level",
                    "url": "https://owl.purdue.edu/owl/general_writing/academic_writing/index.html",
                    "source": "Purdue OWL"
                },
                {
                    "title": "Grammar and Style Guide",
                    "url": "https://www.grammarly.com/blog/writing-tips/",
                    "source": "Grammarly"
                }
            ]
        })
    
    return tasks


def _ensure_tasks_exist(plan, user_id, level, feedback_profile):
    """Ensure every day has tasks - generate fallback tasks if missing"""
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

    for period in plan_json.get("plan", []):
        if "days" not in period or not period["days"]:
            Logger.warning("Period has no days, creating default days")
            period["days"] = []
        
        # Ensure all 7 days exist
        existing_days = {day.get("day", "") for day in period["days"]}
        for day_name in DAY_NAMES:
            if day_name not in existing_days:
                period["days"].append({"day": day_name, "tasks": []})
        
        # Ensure each day has tasks
        for day in period["days"]:
            if not day.get("tasks") or len(day.get("tasks", [])) == 0:
                Logger.info(f"Generating fallback tasks for {day['day']}")
                day["tasks"] = _generate_fallback_tasks_for_day(
                    day["day"],
                    level,
                    feedback_profile.get("weak_skills", []),
                    feedback_profile.get("recent_issues", []),
                )
    
    return plan_json


def _calculate_end_date(start_dt, mode, period_count):
    if mode == "monthly":
        return start_dt + timedelta(days=30 * max(1, period_count))
    return start_dt + timedelta(days=7 * max(1, period_count))


def Generate_Plan(User_Id, Mode="weekly", Level=None):
    Logger.info(f"Generating plan for user {User_Id}, mode {Mode}, level {Level}")
    
    level = _normalize_level(Level or _get_latest_level(User_Id))
    feedback_profile = _get_feedback_profile(User_Id)

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
        # Generate each of the 4 weeks independently to avoid token-limit truncation
        periods = []
        for week_num in range(1, 5):
            week_chunks = _atlas_vector_search(query, cefr_range, top_k=16)
            week_prompt = _build_week_prompt(level, feedback_profile, week_chunks, week_num, 4)
            Logger.info(f"Generating monthly plan Week {week_num}/4 for user {User_Id}")
            try:
                raw = _call_openrouter(week_prompt)
                try:
                    week_data = _safe_json(raw)
                except Exception as e:
                    Logger.warning(f"Week {week_num} JSON invalid, attempting repair: {e}")
                    repaired_raw = _repair_json_with_model(raw)
                    if repaired_raw:
                        week_data = _safe_json(repaired_raw)
                    else:
                        raise
                # If the AI returned a full plan wrapper, extract the first period
                if "plan" in week_data and isinstance(week_data["plan"], list) and week_data["plan"]:
                    week_data = week_data["plan"][0]
                week_data["period"] = f"Week {week_num}"
                periods.append(week_data)
            except Exception as e:
                Logger.error(f"Week {week_num} generation failed: {e}, using empty fallback")
                periods.append({"period": f"Week {week_num}", "days": []})

        plan = {
            "cefr_level": level,
            "mode": Mode,
            "focus_skills": feedback_profile.get("weak_skills", ["writing"]),
            "current_period_index": 0,
            "plan": periods,
        }
        Logger.info(f"Monthly plan assembled with {len(periods)} weeks")
    else:
        prompt = _build_prompt(level, Mode, feedback_profile, chunks)
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
            Logger.error(f"AI plan generation failed: {e}, using fallback")
            plan = {
                "cefr_level": level,
                "mode": Mode,
                "focus_skills": feedback_profile.get("weak_skills", ["writing"]),
                "plan": [{"period": "Week 1", "days": []}]
            }

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

    # Ensure proper structure and tasks
    plan = _ensure_tasks_exist(plan, User_Id, level, feedback_profile)
    
    # Log task count for debugging
    total_tasks = 0
    for period in plan.get("plan", []):
        for day in period.get("days", []):
            total_tasks += len(day.get("tasks", []))
    Logger.info(f"Plan generated with {total_tasks} total tasks across {len(plan.get('plan', []))} periods")
    
    return plan