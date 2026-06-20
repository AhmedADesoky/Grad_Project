import os
import re
import json
import time
import random
import logging
from pathlib import Path
from collections import Counter

from .providers.API_Generator import Generate_Questions_From_API

try:
    from Classification.models import Classification_Level
except Exception:
    Classification_Level = None

try:
    from Feedback.models import Feedback_Result
except Exception:
    Feedback_Result = None

try:
    from Exam.models import Exam_Attempt
except Exception:
    Exam_Attempt = None


Logger = logging.getLogger(__name__)

# ── Load EFCAMDAT question bank ───────────────────────────────────────────────
_BANK_PATH = Path(__file__).parent.parent.parent / "data" / "question_bank.json"
_EFCAMDAT_BANK: dict = {}
try:
    with open(_BANK_PATH, encoding="utf-8") as _f:
        _EFCAMDAT_BANK = json.load(_f)
    Logger.info("Loaded EFCAMDAT question bank: %s", {k: len(v) for k, v in _EFCAMDAT_BANK.items()})
except Exception as _e:
    Logger.warning("Could not load EFCAMDAT question bank from %s: %s", _BANK_PATH, _e)

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

BLUEPRINT_DEFAULT = [
    {
        "task_type": "personal_narrative",
        "label": "Personal Narrative",
        "must_include": True,
    },
    {
        "task_type": "formal_communication",
        "label": "Formal Communication",
        "must_include": True,
    },
    {
        "task_type": "argument_opinion",
        "label": "Argument / Opinion",
        "must_include": True,
    },
    {
        "task_type": "problem_reflection",
        "label": "Problem Solving / Reflection",
        "must_include": True,
    },
]

CEFR_WORD_BOUNDS = {
    "A1": (40, 80),
    "A2": (60, 100),
    "B1": (90, 140),
    "B2": (120, 180),
    "C1": (160, 230),
    "C2": (200, 280),
}

FALLBACK_BANK = {
    "A1_A2": {
        "personal_narrative": [
            "Write about your daily routine and explain your favorite part of the day.",
            "Describe a happy day with your family or friends.",
            "Write about a hobby you enjoy and why it is important to you.",
            "Describing your favorite day: write a personal account of one day you remember well using vivid details. (40-80 words)",
            "Describing routines: write about what you do every day and which activity you like best. (40-80 words)",
            "Writing about what you like doing: write a personal account in your own words using vivid details. (40-80 words)",
            "Planning to attend a music festival: write about a music event you want to go to and why. (60-100 words)",
            "Writing a holiday postcard: describe where you are, what the weather is like, and what you have done so far. (40-80 words)",
        ],
        "formal_communication": [
            "Write a short email to your teacher asking for help with homework.",
            "Write a polite message to ask for information about an English class.",
            "Write an email to request the date and time of a speaking activity.",
            "Introducing yourself by email: write a formal piece of text appropriate to the situation. Use correct punctuation and formal register. (40-80 words)",
            "Replying to a new penpal: write a formal piece of text appropriate to the situation. Use correct punctuation and formal register. (40-80 words)",
            "Writing a birthday invitation: write a formal piece of text appropriate to the situation. Use correct punctuation and formal register. (40-80 words)",
            "Writing a party invitation: write a formal invitation with the correct greeting, details, and sign-off. (40-80 words)",
            "Making notes for a visitor: write a formal piece of text appropriate to the situation. Use correct punctuation and formal register. (60-100 words)",
        ],
        "argument_opinion": [
            "Do you prefer studying in the morning or evening? Explain your opinion.",
            "Is learning English from videos useful? Give reasons for your answer.",
            "Should students do homework every day? Explain your opinion.",
            "Writing about what you enjoy: write your opinion, giving at least two reasons and a conclusion. (40-80 words)",
            "Is it better to study alone or with friends? Give your opinion with two reasons. (60-100 words)",
            "Do you think sports are important for school students? Write your opinion and explain why. (60-100 words)",
        ],
        "problem_reflection": [
            "Describe a small problem you had this week and how you solved it.",
            "Write about a difficult task at school and what you learned from it.",
            "Describe a time you made a mistake and how you fixed it.",
            "Giving directions to a party at home: describe the challenge of explaining how to reach your home and reflect on what you learned. (40-80 words)",
            "Filling in an arrival card: describe the situation, explain the challenge, and reflect on what you learned. (40-80 words)",
        ],
    },
    "B1_B2": {
        "personal_narrative": [
            "Write about a skill you developed recently and how it changed your confidence.",
            "Describe a memorable learning experience and what made it effective.",
            "Narrate a personal goal you achieved and the strategy you used.",
            "Writing an autobiography: write a personal account of the key events in your life in your own words using vivid details. (90-140 words)",
            "Writing a travel blog: describe a place you visited, include interesting details about the people, food, and culture. (90-140 words)",
            "Describing a cultural experience: write a personal account in your own words using vivid details. (90-140 words)",
            "Writing a short story: write a short personal narrative with a beginning, middle, and end. (90-140 words)",
            "Describing a famous person: write about someone you admire, giving specific details about their achievements. (90-140 words)",
        ],
        "formal_communication": [
            "Write a formal email requesting details about an intensive English program.",
            "Write a professional message applying for a student workshop and ask two questions.",
            "Write an email to a course coordinator asking to change your class schedule politely.",
            "Responding to a complaint: write a formal piece of text appropriate to the situation. Use correct punctuation and formal register. (90-140 words)",
            "Writing a formal invitation: write a formal piece of text appropriate to the situation. Use correct punctuation and formal register. (90-140 words)",
            "Writing a memo: write a formal piece of text appropriate to the situation. Use correct punctuation and formal register. (90-140 words)",
            "Planning a business trip: write a formal email to your manager outlining travel arrangements and asking for approval. (90-140 words)",
            "Writing a letter of recommendation: write a formal piece of text appropriate to the situation. Use correct punctuation and formal register. (90-140 words)",
            "Writing a proposal for a project: write a formal piece of text appropriate to the situation. Use correct punctuation and formal register. (90-140 words)",
        ],
        "argument_opinion": [
            "Discuss whether online learning can replace classroom learning for language students.",
            "Argue for or against grading students mainly by exams.",
            "Should schools prioritize communication skills over grammar drills? Explain your position.",
            "Discussing a social problem: write your opinion on an important local problem, giving at least two reasons and a conclusion. (90-140 words)",
            "Writing a letter to the editor: write your opinion on a current community issue, giving at least two reasons and a conclusion. (90-140 words)",
            "Writing a newspaper article: write your opinion, giving at least two reasons and a conclusion. (90-140 words)",
            "Creating an office dress code: should workplaces have strict dress rules? Write your opinion with reasons. (90-140 words)",
        ],
        "problem_reflection": [
            "Describe a challenge in teamwork and explain the steps you took to resolve it.",
            "Write about a communication misunderstanding and what you learned from it.",
            "Explain a study obstacle you faced and evaluate the solution you chose.",
            "Describing a process: describe the situation, explain the challenge, and reflect on what you learned. (90-140 words)",
            "Writing a product review: describe a product or service you used, explain any problems, and reflect on what you would do differently. (90-140 words)",
            "Writing a story with a twist: write about a situation where something unexpected happened and reflect on what it taught you. (90-140 words)",
        ],
    },
    "C1_C2": {
        "personal_narrative": [
            "Narrate a complex personal or academic setback and critically evaluate what it taught you.",
            "Write a reflective account of a turning point that changed your learning philosophy.",
            "Describe an ethically difficult decision you made and justify your reasoning.",
            "Writing an argumentative essay on a personal topic: reflect critically on an experience that challenged your values. (160-230 words)",
            "Evaluating a cultural phenomenon you experienced: narrate your encounter and critically assess its broader significance. (160-230 words)",
        ],
        "formal_communication": [
            "Draft a formal complaint letter about poor educational service and propose actionable remedies.",
            "Write a professional policy memo to a department head recommending a writing-support initiative.",
            "Compose a formal request letter to secure institutional support for a language project.",
            "Writing a policy document: write a formal piece of text appropriate to the situation. Use correct punctuation and formal register. (160-230 words)",
            "Evaluating a business proposal: write a formal piece of text appropriate to the situation. Use correct punctuation and formal register. (160-230 words)",
            "Writing a research summary: write a formal piece of text appropriate to the situation. Use correct punctuation and formal register. (160-230 words)",
        ],
        "argument_opinion": [
            "Write a reasoned argument on whether AI tools improve or weaken academic writing.",
            "Discuss the long-term effects of social media language on formal communication standards.",
            "Argue whether university attendance policies should be mandatory or flexible, with counterarguments.",
            "Writing an argumentative essay: write your opinion, giving at least two reasons and a conclusion. (160-230 words)",
            "Discussing ethical issues: write your opinion, giving at least two reasons and a conclusion with counterarguments. (160-230 words)",
            "Writing a persuasive essay: write your opinion, giving at least two reasons and a conclusion. (160-230 words)",
            "Analyzing a social trend: write your opinion on how this trend affects society, giving at least two reasons and a conclusion. (120-180 words)",
        ],
        "problem_reflection": [
            "Analyze a multifaceted problem in your learning environment and propose a realistic intervention plan.",
            "Reflect on a recurring communication failure and evaluate alternative strategies.",
            "Examine a high-stakes challenge you faced and assess the limits of your final solution.",
            "Writing a critical review: describe the situation, explain the challenge, and reflect on what you learned. (160-230 words)",
            "Analyzing a text: describe the situation, explain the challenge, and reflect on what you learned. (160-230 words)",
            "Evaluating educational methods: describe the situation, explain the challenge, and reflect on what you learned. (120-180 words)",
        ],
    },
}


def _clamp(value, low, high):
    return max(low, min(high, value))


def _normalize_level(level):
    lv = (level or "A1").upper()
    if lv not in LEVELS:
        return "A1"
    return lv


def _level_bucket(level):
    lv = _normalize_level(level)
    if lv in ["A1", "A2"]:
        return "A1_A2"
    if lv in ["B1", "B2"]:
        return "B1_B2"
    return "C1_C2"


def _normalize_text(text):
    t = (text or "").strip().lower()
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"[^\w\s]", "", t)
    return t


def _fingerprint(text):
    return _normalize_text(text)


def _token_set(text):
    return set(_normalize_text(text).split())


def _jaccard_similarity(a, b):
    sa = _token_set(a)
    sb = _token_set(b)
    if not sa and not sb:
        return 1.0
    if not sa or not sb:
        return 0.0
    return len(sa.intersection(sb)) / float(len(sa.union(sb)))


def _infer_task_type(question_text):
    q = (question_text or "").lower()

    formal_hits = ["email", "letter", "request", "formal", "complaint", "coordinator", "apply", "memo"]
    argument_hits = ["argue", "opinion", "discuss", "whether", "should", "for or against", "position"]
    problem_hits = ["challenge", "problem", "solve", "solution", "misunderstanding", "obstacle", "reflect"]
    personal_hits = ["describe", "narrate", "write about", "experience", "you learned", "your"]

    if any(k in q for k in formal_hits):
        return "formal_communication"
    if any(k in q for k in argument_hits):
        return "argument_opinion"
    if any(k in q for k in problem_hits):
        return "problem_reflection"
    if any(k in q for k in personal_hits):
        return "personal_narrative"
    return "personal_narrative"


def _balanced_points(total_points, count):
    count = max(1, int(count))
    total_points = max(count, int(total_points))
    base = total_points // count
    remainder = total_points % count
    return [base + (1 if i < remainder else 0) for i in range(count)]


def _get_recent_fingerprints(user_id, lookback_attempts=12, limit=80):
    if not user_id or Exam_Attempt is None:
        return []

    fingerprints = []
    try:
        attempts = (
            Exam_Attempt.objects
            .filter(User_Id=user_id)
            .order_by("-Created_At")[:lookback_attempts]
        )

        for a in attempts:
            questions = a.Questions or []
            if not isinstance(questions, list):
                continue
            for q in questions:
                text = str(q.get("Question") or "").strip()
                if not text:
                    continue
                fingerprints.append(_fingerprint(text))
                if len(fingerprints) >= limit:
                    return fingerprints
    except Exception as e:
        Logger.warning("Could not load recent fingerprints for user %s: %s", user_id, str(e))

    return fingerprints


def _recent_level_trend(user_id, fallback_level):
    if not user_id or Classification_Level is None:
        return fallback_level

    try:
        rows = (
            Classification_Level.objects
            .filter(User_Id=user_id)
            .order_by("-Created_At")[:4]
        )
        levels = [r.Level for r in rows if r.Level in LEVELS]
        if not levels:
            return fallback_level

        idxs = [LEVELS.index(lv) for lv in levels]
        avg_idx = sum(idxs) / float(len(idxs))
        latest_idx = idxs[0]

        if latest_idx - avg_idx >= 0.75:
            gentle = max(0, latest_idx - 1)
            return LEVELS[gentle]
        if avg_idx - latest_idx >= 1.0:
            gentle = min(len(LEVELS) - 1, latest_idx + 1)
            return LEVELS[gentle]
        return levels[0]
    except Exception as e:
        Logger.warning("Could not compute level trend for user %s: %s", user_id, str(e))
        return fallback_level


def _build_personalization_profile(user_id, requested_level):
    profile = {
        "effective_level": _normalize_level(requested_level),
        "weak_areas": [],
        "style_hints": [],
        "detected_issues": {},   # skill -> list of specific issue strings
    }

    profile["effective_level"] = _recent_level_trend(user_id, profile["effective_level"])

    if not user_id or Feedback_Result is None:
        return profile

    try:
        recent_feedback = (
            Feedback_Result.objects
            .filter(User_Id=user_id)
            .order_by("-Created_At")[:8]
        )

        if not recent_feedback:
            return profile

        g, v, p = [], [], []
        grammar_issues, vocab_issues, punct_issues = [], [], []

        for row in recent_feedback:
            g.append(float(row.Grammar_Score or 0.0))
            v.append(float(row.Vocab_Score or 0.0))
            p.append(float(row.Punct_Score or 0.0))
            # Collect detected_issues strings when available
            issues = getattr(row, "Detected_Issues", None) or {}
            if isinstance(issues, dict):
                grammar_issues.extend(issues.get("grammar", [])[:3])
                vocab_issues.extend(issues.get("vocabulary", [])[:3])
                punct_issues.extend(issues.get("punctuation", [])[:3])

        avg_g = sum(g) / len(g) if g else 0.0
        avg_v = sum(v) / len(v) if v else 0.0
        avg_p = sum(p) / len(p) if p else 0.0

        if avg_g < 65:
            profile["weak_areas"].append("grammar")
            profile["style_hints"].append(
                "include one grammar-sensitive prompt that forces tense and agreement accuracy"
            )
            profile["detected_issues"]["grammar"] = list(dict.fromkeys(grammar_issues))[:5]

        if avg_v < 65:
            profile["weak_areas"].append("vocabulary")
            profile["style_hints"].append(
                "include one lexical-rich task encouraging varied and precise vocabulary"
            )
            profile["detected_issues"]["vocabulary"] = list(dict.fromkeys(vocab_issues))[:5]

        if avg_p < 65:
            profile["weak_areas"].append("punctuation")
            profile["style_hints"].append(
                "include one formal writing task where correct use of commas, apostrophes, and full stops matters"
            )
            profile["detected_issues"]["punctuation"] = list(dict.fromkeys(punct_issues))[:5]

    except Exception as e:
        Logger.warning("Could not build feedback personalization for user %s: %s", user_id, str(e))

    return profile


def _quality_score_question(question_text, level, task_type, recent_fingerprints):
    text = (question_text or "").strip()
    if not text:
        return 0.0, {"reason": "empty"}

    words = [w for w in re.split(r"\s+", text) if w]
    wc = len(words)
    min_words, max_words = CEFR_WORD_BOUNDS[_normalize_level(level)]

    clarity = 1.0 if wc >= 8 else 0.6
    specificity_markers = ["explain", "describe", "discuss", "justify", "evaluate", "steps", "reasons"]
    specificity = 1.0 if any(m in text.lower() for m in specificity_markers) else 0.65
    answerability = 1.0 if "?" not in text or wc > 10 else 0.7

    if _normalize_level(level) in ["A1", "A2"]:
        cefr_fit = 1.0 if wc <= 26 else 0.7
    elif _normalize_level(level) in ["B1", "B2"]:
        cefr_fit = 1.0 if 12 <= wc <= 34 else 0.75
    else:
        cefr_fit = 1.0 if wc >= 14 else 0.7

    novelty = 1.0
    fp = _fingerprint(text)
    if fp in set(recent_fingerprints):
        novelty = 0.2
    else:
        if recent_fingerprints:
            near = 0.0
            for f in recent_fingerprints[:30]:
                near = max(near, _jaccard_similarity(fp, f))
            novelty = 1.0 - _clamp(near, 0.0, 1.0) * 0.7

    score = (
        0.22 * clarity +
        0.2 * specificity +
        0.2 * answerability +
        0.22 * cefr_fit +
        0.16 * novelty
    )

    detail = {
        "clarity": round(clarity, 3),
        "specificity": round(specificity, 3),
        "answerability": round(answerability, 3),
        "cefr_fit": round(cefr_fit, 3),
        "novelty": round(novelty, 3),
        "task_type": task_type,
        "target_word_range": [min_words, max_words],
    }
    return round(score, 4), detail


def _validate_generation_output(questions, count, total_points, blueprint):
    if not isinstance(questions, list):
        raise ValueError("Generated payload is not a list")

    if len(questions) != count:
        raise ValueError(f"Expected {count} questions, got {len(questions)}")

    cleaned = []
    seen_exact = set()

    for i, q in enumerate(questions, start=1):
        if not isinstance(q, dict):
            raise ValueError("Question item must be a dict")

        question_text = str(q.get("Question") or q.get("question") or "").strip()
        points = q.get("Points", q.get("points"))

        try:
            points = int(points)
        except Exception:
            points = 0

        if not question_text:
            raise ValueError("Question text cannot be empty")
        if points <= 0:
            raise ValueError("Question points must be positive")

        fp = _fingerprint(question_text)
        if fp in seen_exact:
            raise ValueError("Duplicate questions detected")
        seen_exact.add(fp)

        cleaned.append(
            {
                "Id": i,
                "Question": question_text,
                "Points": points,
                "Task_Type": str(q.get("Task_Type") or q.get("task_type") or _infer_task_type(question_text)),
            }
        )

    # Near-duplicate check
    for i in range(len(cleaned)):
        for j in range(i + 1, len(cleaned)):
            sim = _jaccard_similarity(cleaned[i]["Question"], cleaned[j]["Question"])
            if sim >= 0.82:
                raise ValueError("Near-duplicate questions detected")

    total = sum(x["Points"] for x in cleaned)
    if total != int(total_points):
        pts = _balanced_points(total_points, count)
        for idx, q in enumerate(cleaned):
            q["Points"] = pts[idx]

    # Coverage check for first 4 blueprint task types
    must_types = [x["task_type"] for x in blueprint[:min(len(blueprint), len(cleaned))]]
    got_types = [x["Task_Type"] for x in cleaned]

    for required_type in must_types:
        if required_type not in got_types:
            # force one slot to missing type
            for idx in range(len(cleaned)):
                current = cleaned[idx]["Task_Type"]
                if got_types.count(current) > 1:
                    cleaned[idx]["Task_Type"] = required_type
                    got_types[idx] = required_type
                    break

    return cleaned


def _get_efcamdat_candidates(level, task_type, skill_focus=None):
    """Return EFCAMDAT prompts for the given level bucket and task type."""
    bucket_levels = {
        "A1_A2": ["A1", "A2"],
        "B1_B2": ["B1", "B2"],
        "C1_C2": ["C1", "C2"],
    }
    candidates = []
    for lv in bucket_levels.get(_level_bucket(level), []):
        for entry in _EFCAMDAT_BANK.get(lv, []):
            if entry["task_type"] == task_type:
                if skill_focus is None or entry["skill_focus"] == skill_focus or entry["skill_focus"] == "general":
                    candidates.append(entry["prompt"])
    return candidates


def _fallback_generate(level, count, total_points, blueprint, recent_fingerprints, weak_areas=None):
    bucket = _level_bucket(level)
    bank = FALLBACK_BANK[bucket]
    fp_set = set(recent_fingerprints)
    points_plan = _balanced_points(total_points, count)
    questions = []
    used_skill_focuses = set()

    for i in range(count):
        bp = blueprint[i % len(blueprint)]
        ttype = bp["task_type"]

        # Determine preferred skill focus for this slot based on weak areas
        skill_focus = None
        if weak_areas:
            for area in weak_areas:
                if area not in used_skill_focuses:
                    skill_focus = area
                    break

        # First try EFCAMDAT bank with skill targeting
        efcamdat = _get_efcamdat_candidates(level, ttype, skill_focus)
        random.shuffle(efcamdat)

        # Then fallback bank
        static = list(bank.get(ttype, []))
        random.shuffle(static)

        chosen = None
        chosen_skill = "general"

        for c in efcamdat:
            if _fingerprint(c) not in fp_set:
                chosen = c
                chosen_skill = skill_focus or "general"
                break

        if chosen is None:
            for c in static:
                if _fingerprint(c) not in fp_set:
                    chosen = c
                    break

        if chosen is None:
            # Accept any, even if seen before
            chosen = efcamdat[0] if efcamdat else (static[0] if static else "Write a coherent paragraph on a relevant topic.")

        if skill_focus:
            used_skill_focuses.add(skill_focus)
        fp_set.add(_fingerprint(chosen))

        questions.append({
            "Id": i + 1,
            "Question": chosen,
            "Points": points_plan[i],
            "Task_Type": ttype,
        })

    return questions


def _sanitize_for_schema(questions):
    sanitized = []
    for q in questions:
        sanitized.append(
            {
                "Id": int(q["Id"]),
                "Question": str(q["Question"]).strip(),
                "Points": int(q["Points"]),
            }
        )
    return sanitized


def Get_Generated_Exam_Questions(User_Id, Level=None, Count=4):
    t0 = time.time()

    count = max(1, min(int(Count or 4), int(os.getenv("EXAM_QUESTIONS_MAX_COUNT", "10"))))
    total_points = int(os.getenv("EXAM_TOTAL_POINTS", "50"))
    provider = (os.getenv("EXAM_GENERATOR_PROVIDER") or "template").lower()
    quality_threshold = float(os.getenv("EXAM_QUESTION_QUALITY_THRESHOLD", "0.62"))
    retries = max(1, int(os.getenv("EXAM_GENERATION_RETRIES", "3")))

    profile = _build_personalization_profile(User_Id, Level or "A1")
    effective_level = profile["effective_level"]
    word_bounds = CEFR_WORD_BOUNDS.get(effective_level, CEFR_WORD_BOUNDS["A1"])
    recent_fingerprints = _get_recent_fingerprints(User_Id)

    blueprint = BLUEPRINT_DEFAULT[:]
    if count < len(blueprint):
        blueprint = blueprint[:count]
    elif count > len(blueprint):
        while len(blueprint) < count:
            blueprint.append(BLUEPRINT_DEFAULT[len(blueprint) % len(BLUEPRINT_DEFAULT)])

    # Personalization: keep formal task if punctuation is weak
    if "punctuation" in profile["weak_areas"]:
        blueprint[1]["task_type"] = "formal_communication"

    # Personalization: keep one lexical-focused argument or narrative when vocab is weak
    if "vocabulary" in profile["weak_areas"] and count >= 3:
        blueprint[2]["task_type"] = "argument_opinion"

    last_error = None
    used_fallback = False
    result = None

    if provider in ["openrouter", "api"]:
        for attempt in range(1, retries + 1):
            try:
                generated = Generate_Questions_From_API(
                    level=effective_level,
                    count=count,
                    total_points=total_points,
                    blueprint=blueprint,
                    learner_profile=profile,
                    recent_fingerprints=recent_fingerprints,
                    word_bounds=word_bounds,
                    retry_count=max(1, retries - attempt + 1),
                )

                checked = _validate_generation_output(generated, count, total_points, blueprint)

                scores = []
                for q in checked:
                    s, _ = _quality_score_question(
                        q["Question"],
                        effective_level,
                        q["Task_Type"],
                        recent_fingerprints,
                    )
                    scores.append(s)

                avg_score = sum(scores) / len(scores) if scores else 0.0
                if avg_score < quality_threshold:
                    raise ValueError(f"Average quality below threshold: {avg_score:.3f} < {quality_threshold:.3f}")

                result = checked
                Logger.info(
                    "Exam generation success | provider=%s | level=%s | user=%s | attempt=%s/%s | avg_quality=%.3f",
                    provider, effective_level, User_Id, attempt, retries, avg_score
                )
                break

            except Exception as e:
                last_error = e
                Logger.warning(
                    "Exam generation attempt failed | provider=%s | level=%s | user=%s | attempt=%s/%s | error=%s",
                    provider, effective_level, User_Id, attempt, retries, str(e)
                )

    if result is None:
        used_fallback = True
        result = _fallback_generate(
            level=effective_level,
            count=count,
            total_points=total_points,
            blueprint=blueprint,
            recent_fingerprints=recent_fingerprints,
            weak_areas=profile.get("weak_areas", []),
        )

    elapsed_ms = int((time.time() - t0) * 1000)
    Logger.info(
        "Exam generation completed | provider=%s | fallback=%s | level=%s | user=%s | count=%s | elapsed_ms=%s | last_error=%s",
        provider,
        used_fallback,
        effective_level,
        User_Id,
        count,
        elapsed_ms,
        str(last_error) if last_error else "none",
    )

    return _sanitize_for_schema(result)