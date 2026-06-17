import os
import re
import json
import time
import logging
from urllib import request, error

Logger = logging.getLogger(__name__)

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]


def _normalize_text(text):
    t = (text or "").strip().lower()
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"[^\w\s]", "", t)
    return t


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


def _rebalance_points(items, total_points):
    count = len(items)
    base = total_points // count
    remainder = total_points % count
    for idx, item in enumerate(items):
        item["Points"] = base + (1 if idx < remainder else 0)
    return items


def _repair_json_like_array(text):
    candidate = (text or "").strip()

    # remove markdown fences
    if candidate.startswith("~~~"):
        candidate = candidate.strip("~")
    if candidate.startswith("```"):
        candidate = candidate.strip("`")
        if "\n" in candidate:
            candidate = candidate.split("\n", 1)[1]
        if candidate.endswith("```"):
            candidate = candidate[:-3]

    # keep only first array payload if extra text exists
    left = candidate.find("[")
    right = candidate.rfind("]")
    if left != -1 and right != -1 and right > left:
        candidate = candidate[left:right + 1]

    # normalize quotes
    candidate = candidate.replace("\u201c", "\"").replace("\u201d", "\"").replace("\u2018", "'").replace("\u2019", "'")

    # quote bare keys: Question: -> "Question":
    candidate = re.sub(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)", r'\1"\2"\3', candidate)

    # remove trailing commas before } or ]
    candidate = re.sub(r",\s*([}\]])", r"\1", candidate)

    return candidate


def _extract_json_array(text):
    cleaned = _repair_json_like_array(text)
    try:
        payload = json.loads(cleaned)
    except Exception as e:
        raise ValueError("Model output is not valid JSON array") from e

    if not isinstance(payload, list):
        raise ValueError("Model output is not a JSON array")
    return payload


def _infer_task_type(question_text):
    q = (question_text or "").lower()

    if any(k in q for k in ["email", "letter", "formal", "request", "complaint", "memo"]):
        return "formal_communication"
    if any(k in q for k in ["argue", "opinion", "discuss", "for or against", "should", "position"]):
        return "argument_opinion"
    if any(k in q for k in ["challenge", "problem", "solution", "steps", "reflect", "misunderstanding"]):
        return "problem_reflection"
    return "personal_narrative"


def _quality_score(question_text, level, recent_fingerprints):
    text = (question_text or "").strip()
    if not text:
        return 0.0

    wc = len([w for w in text.split() if w])
    lower = text.lower()

    clarity = 1.0 if wc >= 8 else 0.6
    specificity = 1.0 if any(k in lower for k in ["explain", "describe", "discuss", "justify", "evaluate"]) else 0.65
    answerability = 1.0 if wc >= 9 else 0.7

    if level in ["A1", "A2"]:
        cefr_fit = 1.0 if wc <= 26 else 0.7
    elif level in ["B1", "B2"]:
        cefr_fit = 1.0 if 11 <= wc <= 36 else 0.75
    else:
        cefr_fit = 1.0 if wc >= 13 else 0.7

    novelty = 1.0
    norm = _normalize_text(text)
    if norm in set(recent_fingerprints or []):
        novelty = 0.2
    else:
        if recent_fingerprints:
            near = max(_jaccard_similarity(norm, fp) for fp in recent_fingerprints[:30])
            novelty = 1.0 - min(near, 1.0) * 0.7

    return (
        0.22 * clarity +
        0.2 * specificity +
        0.2 * answerability +
        0.22 * cefr_fit +
        0.16 * novelty
    )


def _normalize_questions(raw_questions, count, total_points, blueprint=None):
    if not isinstance(raw_questions, list):
        raise ValueError("API returned non-list questions payload")

    cleaned = []
    seen_exact = set()

    for i, q in enumerate(raw_questions[:count], start=1):
        if not isinstance(q, dict):
            continue

        question_text = str(q.get("Question") or q.get("question") or "").strip()
        if not question_text:
            continue

        points = q.get("Points", q.get("points"))
        try:
            points = int(points)
        except Exception:
            points = 0

        if points <= 0:
            continue

        fp = _normalize_text(question_text)
        if fp in seen_exact:
            continue
        seen_exact.add(fp)

        task_type = str(q.get("Task_Type") or q.get("task_type") or _infer_task_type(question_text))

        cleaned.append({
            "Id": i,
            "Question": question_text,
            "Points": points,
            "Task_Type": task_type,
        })

    if len(cleaned) != count:
        raise ValueError("API did not return the requested number of valid questions")

    for i in range(len(cleaned)):
        for j in range(i + 1, len(cleaned)):
            if _jaccard_similarity(cleaned[i]["Question"], cleaned[j]["Question"]) >= 0.82:
                raise ValueError("Near-duplicate questions detected in API output")

    if blueprint:
        required_types = [b.get("task_type") for b in blueprint[:count]]
        current_types = [x["Task_Type"] for x in cleaned]
        for t in required_types:
            if t not in current_types:
                for idx in range(len(cleaned)):
                    if current_types.count(current_types[idx]) > 1:
                        cleaned[idx]["Task_Type"] = t
                        current_types[idx] = t
                        break

    current_total = sum(item["Points"] for item in cleaned)
    if current_total != total_points:
        cleaned = _rebalance_points(cleaned, total_points)

    return cleaned


def _call_openrouter(messages, temperature, timeout, model, base_url, api_key, referer, app_name):
    body = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 700,
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

    with request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    try:
        return payload["choices"][0]["message"]["content"]
    except Exception as e:
        raise RuntimeError(f"Unexpected OpenRouter response shape: {payload}") from e


def _build_system_prompt():
    return (
        "You are a CEFR-aligned English writing exam designer. "
        "Return strict JSON array only, no markdown, no prose. "
        "Each item must be an object with keys: Question, Points, Task_Type."
    )


def _build_user_prompt(level, count, total_points, blueprint, learner_profile, word_bounds, recent_fingerprints):
    min_words, max_words = word_bounds
    blueprint_lines = []

    for idx, bp in enumerate(blueprint[:count], start=1):
        blueprint_lines.append(f"{idx}. {bp.get('task_type')}")

    style_hints = learner_profile.get("style_hints", []) if learner_profile else []
    weak_areas = learner_profile.get("weak_areas", []) if learner_profile else []

    banned_examples = [
        "Write anything about English.",
        "Discuss a topic.",
        "Tell me your opinion.",
    ]

    return (
        f"Generate exactly {count} writing exam questions for CEFR level {level}. "
        f"Total points across all questions must be exactly {total_points}. "
        f"Expected answer length per question should target {min_words}-{max_words} words. "
        "Task types must follow this blueprint in order: "
        + " | ".join(blueprint_lines) + ". "
        "Enforce topic diversity across all questions. "
        "Disallow duplicates, near-duplicates, vague prompts, and non-writing tasks. "
        "Do not use multiple-choice or fill-in-the-blank formats. "
        "If user has weaknesses, reflect them naturally in one or two tasks. "
        f"Weak areas: {', '.join(weak_areas) if weak_areas else 'none'}. "
        f"Style hints: {'; '.join(style_hints) if style_hints else 'none'}. "
        f"Avoid repeating recent question fingerprints count: {len(recent_fingerprints or [])}. "
        f"Banned vague examples: {banned_examples}. "
        "Return raw JSON array only."
    )


def _regenerate_single_question(
    level,
    task_type,
    points,
    word_bounds,
    model,
    base_url,
    api_key,
    referer,
    app_name,
    timeout,
    recent_fingerprints,
):
    min_words, max_words = word_bounds

    system_prompt = _build_system_prompt()
    user_prompt = (
        f"Generate one writing question only. "
        f"CEFR level: {level}. "
        f"Task_Type must be exactly: {task_type}. "
        f"Points must be exactly: {points}. "
        f"Target answer length: {min_words}-{max_words} words. "
        "Return strict JSON array with one object only. "
        "No markdown and no extra text."
    )

    content = _call_openrouter(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        timeout=timeout,
        model=model,
        base_url=base_url,
        api_key=api_key,
        referer=referer,
        app_name=app_name,
    )

    arr = _extract_json_array(content)
    normalized = _normalize_questions(arr, 1, points, blueprint=[{"task_type": task_type}])
    q = normalized[0]

    # hard novelty gate
    fp = _normalize_text(q["Question"])
    if fp in set(recent_fingerprints or []):
        raise ValueError("Regenerated question repeated recent content")

    return q


def Generate_Questions_From_API(
    level,
    count,
    total_points,
    blueprint=None,
    learner_profile=None,
    recent_fingerprints=None,
    word_bounds=None,
    retry_count=3,
):
    provider = (os.getenv("EXAM_GENERATOR_PROVIDER") or "openrouter").lower()
    if provider != "openrouter":
        raise RuntimeError(f"Unsupported API provider: {provider}")

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is missing")

    model = os.getenv("EXAM_GENERATOR_MODEL", "google/gemini-2.5-flash-lite")
    base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
    referer = os.getenv("OPENROUTER_HTTP_REFERER", "http://localhost:8000")
    app_name = os.getenv("OPENROUTER_APP_NAME", "EWC-AI-Backend")
    timeout = int(os.getenv("EXAM_GENERATION_TIMEOUT_SECONDS", "45"))

    level = (level or "A1").upper()
    if level not in LEVELS:
        level = "A1"

    if not blueprint:
        blueprint = [
            {"task_type": "personal_narrative"},
            {"task_type": "formal_communication"},
            {"task_type": "argument_opinion"},
            {"task_type": "problem_reflection"},
        ]

    if not word_bounds:
        default_bounds = {
            "A1": (40, 80),
            "A2": (60, 100),
            "B1": (90, 140),
            "B2": (120, 180),
            "C1": (160, 230),
            "C2": (200, 280),
        }
        word_bounds = default_bounds[level]

    recent_fingerprints = recent_fingerprints or []
    quality_threshold = float(os.getenv("EXAM_QUESTION_QUALITY_THRESHOLD", "0.62"))
    max_low_quality_repairs = int(os.getenv("EXAM_MAX_LOW_QUALITY_REPAIRS", "2"))

    system_prompt = _build_system_prompt()
    user_prompt = _build_user_prompt(
        level=level,
        count=count,
        total_points=total_points,
        blueprint=blueprint,
        learner_profile=learner_profile or {},
        word_bounds=word_bounds,
        recent_fingerprints=recent_fingerprints,
    )

    last_error = None
    retries = max(1, int(retry_count))

    for attempt in range(1, retries + 1):
        temp = max(0.1, 0.5 - (attempt - 1) * 0.15)
        t0 = time.time()
        try:
            content = _call_openrouter(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temp,
                timeout=timeout,
                model=model,
                base_url=base_url,
                api_key=api_key,
                referer=referer,
                app_name=app_name,
            )

            raw_questions = _extract_json_array(content)
            cleaned = _normalize_questions(raw_questions, count, total_points, blueprint=blueprint)

            # Quality scoring and partial regeneration
            low_quality_indexes = []
            for idx, q in enumerate(cleaned):
                score = _quality_score(q["Question"], level, recent_fingerprints)
                q["Quality_Score"] = round(score, 4)
                if score < quality_threshold:
                    low_quality_indexes.append(idx)

            repairs_done = 0
            for idx in low_quality_indexes:
                if repairs_done >= max_low_quality_repairs:
                    break
                target = cleaned[idx]
                regenerated = _regenerate_single_question(
                    level=level,
                    task_type=target["Task_Type"],
                    points=int(target["Points"]),
                    word_bounds=word_bounds,
                    model=model,
                    base_url=base_url,
                    api_key=api_key,
                    referer=referer,
                    app_name=app_name,
                    timeout=timeout,
                    recent_fingerprints=recent_fingerprints,
                )
                regenerated["Task_Type"] = target["Task_Type"]
                regenerated["Points"] = int(target["Points"])
                regenerated["Id"] = target["Id"]
                regenerated["Quality_Score"] = round(
                    _quality_score(regenerated["Question"], level, recent_fingerprints), 4
                )
                cleaned[idx] = regenerated
                repairs_done += 1

            # FIX: Save quality scores keyed by Id BEFORE re-normalizing.
            # _normalize_questions() only preserves Id, Question, Points, Task_Type —
            # it strips Quality_Score, causing avg_quality to always be 0.0 and
            # raising "Average quality too low after repair: 0.000" every time.
            quality_scores_by_id = {q["Id"]: q.get("Quality_Score", 0.0) for q in cleaned}

            cleaned = _rebalance_points(cleaned, total_points)
            cleaned = _normalize_questions(cleaned, count, total_points, blueprint=blueprint)

            # Restore quality scores that were stripped by _normalize_questions
            for q in cleaned:
                q["Quality_Score"] = quality_scores_by_id.get(q["Id"], 0.0)

            avg_quality = sum(float(x.get("Quality_Score", 0.0)) for x in cleaned) / len(cleaned)
            if avg_quality < quality_threshold:
                raise ValueError(f"Average quality too low after repair: {avg_quality:.3f}")

            elapsed_ms = int((time.time() - t0) * 1000)
            Logger.info(
                "API generation success | model=%s | attempt=%s/%s | temp=%.2f | elapsed_ms=%s | avg_quality=%.3f | repairs=%s",
                model, attempt, retries, temp, elapsed_ms, avg_quality, repairs_done
            )

            return cleaned

        except error.HTTPError as e:
            details = e.read().decode("utf-8", errors="ignore")
            last_error = RuntimeError(f"OpenRouter HTTP {e.code}: {details}")
            Logger.warning(
                "API generation HTTP error | attempt=%s/%s | error=%s",
                attempt, retries, str(last_error)
            )
        except Exception as e:
            last_error = e
            Logger.warning(
                "API generation error | attempt=%s/%s | error=%s",
                attempt, retries, str(e)
            )

    raise RuntimeError(f"OpenRouter generation failed after retries: {str(last_error)}")