import os
import re
from datetime import timedelta

import graphene
from django.utils import timezone
from graphene import (
    ObjectType,
    String,
    Int,
    Float,
    Boolean,
    List,
    Field,
    Mutation,
    InputObjectType,
)

from Classification.services.DistilBERT_Classifier import Get_Classifier
from Feedback.services.Feedback_Model import Get_Feedback_Analyzer
from Classification.models import Classification_Level
from Feedback.models import Feedback_Result
from .models import Exam_Attempt
from .services.Question_Generator import Get_Generated_Exam_Questions
from middleware.auth import require_auth, rate_limit


LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

_AI_THRESHOLD = 85.0
_AI_MIN_WORDS = 30  # skip detection on very short answers the model can't judge reliably


def _check_ai(text):
    """Run AI detection. Returns (is_ai: bool, ai_probability: float).
    Raises on detector crash so callers can reject rather than silently pass.
    """
    from AI_Detection.services.AI_Detector import is_available, Get_Detector
    if not is_available():
        return False, 0.0
    result = Get_Detector().predict(text)
    return result["ai_probability"] > _AI_THRESHOLD, result["ai_probability"]

STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "if", "then", "than", "that", "this",
    "is", "are", "was", "were", "be", "been", "being", "to", "of", "in", "on",
    "at", "for", "from", "with", "by", "as", "it", "its", "i", "you", "he", "she",
    "we", "they", "my", "your", "our", "their", "me", "us", "them", "about",
    "into", "over", "under", "after", "before", "during", "any", "some", "can",
    "could", "would", "should", "will", "shall", "do", "does", "did", "have",
    "has", "had",
}


def clamp(value, low, high):
    return max(low, min(high, value))


def tokenize_keywords(text):
    if not text:
        return []
    tokens = re.findall(r"[A-Za-z']+", str(text).lower())
    return [t for t in tokens if len(t) > 2 and t not in STOP_WORDS]


def parse_word_limits(question_text):
    text = str(question_text or "").lower()

    m_range = re.search(r"(\d+)\s*[-–]\s*(\d+)\s*words?", text)
    if m_range:
        lo = int(m_range.group(1))
        hi = int(m_range.group(2))
        if lo > hi:
            lo, hi = hi, lo
        return lo, hi

    m_min = re.search(r"(at\s+least|min(?:imum)?)\s*(\d+)\s*words?", text)
    if m_min:
        return int(m_min.group(2)), None

    m_exact = re.search(r"(\d+)\s*words?", text)
    if m_exact:
        exact = int(m_exact.group(1))
        return exact, exact

    return None, None


def compute_relevance_score(question_text, answer_text):
    q_tokens = set(tokenize_keywords(question_text))
    a_tokens = set(tokenize_keywords(answer_text))

    if not answer_text or not answer_text.strip():
        return 0.0

    # If prompt keywords are weak, keep relevance neutral instead of harsh.
    if not q_tokens:
        return 70.0

    overlap = len(q_tokens.intersection(a_tokens))
    recall = overlap / max(1, len(q_tokens))
    precision = overlap / max(1, len(a_tokens))

    score = 100.0 * (0.7 * recall + 0.3 * precision)
    return round(clamp(score, 0.0, 100.0), 2)


def compute_completeness_score(question_text, answer_text):
    words = re.findall(r"[A-Za-z']+", str(answer_text or ""))
    wc = len(words)

    if wc == 0:
        return 0.0

    lo, hi = parse_word_limits(question_text)

    if lo is not None and hi is not None:
        if lo <= wc <= hi:
            return 100.0
        if wc < lo:
            return round(clamp((wc / max(1, lo)) * 100.0, 0.0, 100.0), 2)

        excess = wc - hi
        penalty = min(30.0, excess * 0.8)
        return round(clamp(100.0 - penalty, 70.0, 100.0), 2)

    if lo is not None:
        return round(clamp((wc / max(1, lo)) * 100.0, 0.0, 100.0), 2)

    # Generic fallback if prompt has no explicit word count instruction.
    if wc < 20:
        return 55.0
    if wc < 40:
        return 75.0
    return 100.0


def compute_language_score(feedback_data):
    overall = float(feedback_data.get("overall_score", 0.0))
    grammar = float(feedback_data.get("grammar_score", 0.0))
    vocab = float(feedback_data.get("vocab_score", 0.0))
    punct = float(feedback_data.get("punct_score", 0.0))

    score = (0.7 * overall) + (0.1 * grammar) + (0.1 * vocab) + (0.1 * punct)
    return round(clamp(score, 0.0, 100.0), 2)


def normalize_probabilities(raw_probs, fallback_level="A1", fallback_confidence=0.0):
    probs = {lv: 0.0 for lv in LEVELS}

    if isinstance(raw_probs, dict):
        for lv in LEVELS:
            try:
                probs[lv] = float(raw_probs.get(lv, 0.0) or 0.0)
            except (TypeError, ValueError):
                probs[lv] = 0.0

    total = sum(probs.values())

    if total <= 0:
        top_prob = clamp(float(fallback_confidence or 0.0) / 100.0, 0.35, 0.95)
        remaining = 1.0 - top_prob
        spread = remaining / 5.0
        for lv in LEVELS:
            probs[lv] = spread
        if fallback_level in LEVELS:
            probs[fallback_level] = top_prob
        total = sum(probs.values())

    if total > 1.5:
        probs = {lv: probs[lv] / 100.0 for lv in LEVELS}
        total = sum(probs.values())

    if total <= 0:
        uniform = 1.0 / len(LEVELS)
        return {lv: uniform for lv in LEVELS}

    return {lv: probs[lv] / total for lv in LEVELS}


def aggregate_exam_level(answer_metrics):
    weighted_sum = {lv: 0.0 for lv in LEVELS}
    total_weight = 0.0

    for item in answer_metrics:
        probs = item["probs"]
        weight = item["weight"]
        total_weight += weight
        for lv in LEVELS:
            weighted_sum[lv] += weight * probs[lv]

    if total_weight <= 0:
        uniform = 1.0 / len(LEVELS)
        agg = {lv: uniform for lv in LEVELS}
    else:
        agg = {lv: weighted_sum[lv] / total_weight for lv in LEVELS}

    ranked = sorted(LEVELS, key=lambda lv: agg[lv], reverse=True)
    top1 = ranked[0]
    top2 = ranked[1]
    margin = agg[top1] - agg[top2]

    return agg, top1, top2, margin


def nearest_lower_level(level):
    if level not in LEVELS:
        return "A1"
    idx = LEVELS.index(level)
    if idx <= 0:
        return "A1"
    return LEVELS[idx - 1]


def convert_attempt_to_type(a):
    return Exam_Attempt_Type(
        Attempt_Id=a.Attempt_Id,
        User_Id=a.User_Id,
        Level=a.Level,
        Duration_Minutes=a.Duration_Minutes,
        Started_At=str(a.Started_At) if a.Started_At else None,
        Expires_At=str(a.Expires_At) if a.Expires_At else None,
        Submitted_At=str(a.Submitted_At) if a.Submitted_At else None,
        Status=a.Status,
        Auto_Submitted=a.Auto_Submitted,
        Questions=a.Questions or [],
        Answers=a.Answers or [],
        Question_Results=a.Question_Results or [],
        Total_Points=float(a.Total_Points or 0.0),
        Total_Score=float(a.Total_Score or 0.0),
        Percentage=float(a.Percentage or 0.0),
        Passed=bool(a.Passed),
        Final_Level=a.Final_Level or "A1",
        Final_Confidence=float(a.Final_Confidence or 0.0),
        Created_At=str(a.Created_At) if a.Created_At else None,
        Updated_At=str(a.Updated_At) if a.Updated_At else None,
    )


class Exam_Question_Type(ObjectType):
    Id = Int()
    Question = String()
    Points = Int()


class Exam_Answer_Input(InputObjectType):
    Question_Id = Int(required=True)
    Answer_Text = String(required=True)
    Points = Int(required=True)


class Question_Evaluation_Type(ObjectType):
    Question_Id = Int()
    Points = Int()
    Awarded_Points = Float()
    Classification_Level = String()
    Classification_Confidence = Float()
    Classification_Description = String()
    Feedback_Overall_Score = Float()
    Feedback_Grammar_Score = Float()
    Feedback_Vocab_Score = Float()
    Feedback_Punct_Score = Float()
    Feedback_Corrected_Text = String()
    Feedback_Detected_Issues = List(String)
    Feedback_Errors = graphene.JSONString()
    Feedback_Error_Trend = String()
    Feedback_Dominant_Error = String()
    Answer_Text = String()


class Exam_Attempt_Type(ObjectType):
    Attempt_Id = String()
    User_Id = String()
    Level = String()
    Duration_Minutes = Int()
    Started_At = String()
    Expires_At = String()
    Submitted_At = String()
    Status = String()
    Auto_Submitted = Boolean()
    Questions = graphene.JSONString()
    Answers = graphene.JSONString()
    Question_Results = graphene.JSONString()
    Total_Points = Float()
    Total_Score = Float()
    Percentage = Float()
    Passed = Boolean()
    Final_Level = String()
    Final_Confidence = Float()
    Created_At = String()
    Updated_At = String()


class Generate_Exam_Questions_Mutation(Mutation):
    class Arguments:
        User_Id = String(required=True)
        Level = String(required=False)
        Count = Int(default_value=4)
        Duration_Minutes = Int(required=False)

    Success = Boolean()
    Questions = List(Exam_Question_Type)
    Attempt_Id = String()
    Started_At = String()
    Expires_At = String()
    Duration_Minutes = Int()
    Error = String()

    @require_auth
    @rate_limit(max_calls=10, window_seconds=3600)  # 10 exam starts per hour
    def mutate(self, info, User_Id, Level=None, Count=4, Duration_Minutes=None):
        try:
            questions = Get_Generated_Exam_Questions(
                User_Id=User_Id,
                Level=Level,
                Count=Count,
            )

            duration_minutes = int(Duration_Minutes or os.getenv("EXAM_DURATION_MINUTES", "45"))
            duration_minutes = max(1, duration_minutes)

            started_at = timezone.now()
            expires_at = started_at + timedelta(minutes=duration_minutes)

            level_value = (Level or "A1").upper()
            if level_value not in LEVELS:
                level_value = "A1"

            normalized_questions = []
            for q in questions:
                normalized_questions.append(
                    {
                        "Id": int(q.get("Id")),
                        "Question": str(q.get("Question") or ""),
                        "Points": int(q.get("Points") or 0),
                    }
                )

            attempt = Exam_Attempt.objects.create(
                User_Id=User_Id,
                Level=level_value,
                Duration_Minutes=duration_minutes,
                Started_At=started_at,
                Expires_At=expires_at,
                Status="IN_PROGRESS",
                Auto_Submitted=False,
                Questions=normalized_questions,
                Answers=[],
                Question_Results=[],
            )

            return Generate_Exam_Questions_Mutation(
                Success=True,
                Questions=[Exam_Question_Type(**q) for q in normalized_questions],
                Attempt_Id=attempt.Attempt_Id,
                Started_At=str(started_at),
                Expires_At=str(expires_at),
                Duration_Minutes=duration_minutes,
            )
        except Exception as e:
            return Generate_Exam_Questions_Mutation(
                Success=False,
                Error="Failed to generate exam questions: " + str(e),
            )


class Evaluate_Exam_Mutation(Mutation):
    class Arguments:
        User_Id = String(required=True)
        Attempt_Id = String(required=False)
        Answers = List(Exam_Answer_Input, required=True)
        Save_To_Database = Boolean(default_value=True)

    Success = Boolean()
    Attempt_Id = String()
    Submitted_At = String()
    Is_Expired = Boolean()
    Auto_Submitted = Boolean()
    Final_Level = String()
    Final_Confidence = Float()
    Total_Score = Float()
    Percentage = Float()
    Passed = Boolean()
    Question_Results = List(Question_Evaluation_Type)
    AI_Detected = Boolean()
    AI_Confidence = Float()
    Error = String()

    @require_auth
    def mutate(self, info, User_Id, Answers, Save_To_Database=True, Attempt_Id=None):
        try:
            if not Answers:
                return Evaluate_Exam_Mutation(
                    Success=False,
                    Error="Answers list cannot be empty",
                )

            pass_threshold = clamp(float(os.getenv("EXAM_PASS_PERCENTAGE", "70")), 0.0, 100.0)

            attempt = None
            is_expired = False

            if Save_To_Database:
                if not Attempt_Id:
                    return Evaluate_Exam_Mutation(
                        Success=False,
                        Error="Attempt_Id is required when Save_To_Database is true",
                    )

                attempt = Exam_Attempt.objects.filter(
                    Attempt_Id=Attempt_Id,
                    User_Id=User_Id,
                ).first()

                if not attempt:
                    return Evaluate_Exam_Mutation(
                        Success=False,
                        Error="Exam attempt not found",
                    )

                if attempt.Status in ["SUBMITTED", "AUTO_SUBMITTED", "EXPIRED"]:
                    return Evaluate_Exam_Mutation(
                        Success=False,
                        Error="This exam attempt is already finalized",
                    )

                is_expired = timezone.now() >= attempt.Expires_At

            # ── AI detection pre-scan ──────────────────────────────────────────
            ai_flagged_count = 0
            ai_flagged_probs = []
            checkable_count = 0
            for a in Answers:
                raw_text = (a.Answer_Text or "").strip()
                if not raw_text:
                    continue
                if len(raw_text.split()) < _AI_MIN_WORDS:
                    continue
                checkable_count += 1
                try:
                    is_ai, ai_prob = _check_ai(raw_text)
                except Exception as det_err:
                    Logger.error("AI detector crashed during exam scan — skipping answer: %s", det_err)
                    continue
                if is_ai:
                    ai_flagged_count += 1
                    ai_flagged_probs.append(ai_prob)

            # Reject only if majority of checkable answers are flagged
            if checkable_count > 0 and ai_flagged_count >= max(2, checkable_count // 2 + 1):
                avg_ai_prob = round(sum(ai_flagged_probs) / len(ai_flagged_probs), 2)
                if Save_To_Database and attempt:
                    attempt.Status = "AI_DETECTED"
                    attempt.save()
                return Evaluate_Exam_Mutation(
                    Success=False,
                    AI_Detected=True,
                    AI_Confidence=avg_ai_prob,
                    Error=(
                        f"AI-generated content detected in your exam answers "
                        f"({avg_ai_prob:.1f}% confidence). Your exam has been cancelled."
                    ),
                )

            classifier = Get_Classifier()
            feedback_analyzer = Get_Feedback_Analyzer()

            results = []
            question_results_payload = []
            stored_answers = []
            total_awarded = 0.0
            total_points = 0.0
            non_empty_answers = []
            answer_metrics = []

            points_by_question = {}
            question_text_by_id = {}

            if attempt and isinstance(attempt.Questions, list):
                for q in attempt.Questions:
                    try:
                        q_id = int(q.get("Id"))
                        points_by_question[q_id] = float(q.get("Points", 0))
                        question_text_by_id[q_id] = str(q.get("Question") or "")
                    except Exception:
                        continue

            for a in Answers:
                q_id = int(a.Question_Id)
                answer_text = (a.Answer_Text or "").strip()

                max_points_client = float(a.Points or 0.0)
                max_points_server = points_by_question.get(q_id, max_points_client)
                max_points = max(0.0, max_points_server)

                total_points += max_points

                stored_answers.append(
                    {
                        "Question_Id": q_id,
                        "Answer_Text": answer_text,
                        "Points": max_points,
                    }
                )

                if not answer_text:
                    item = {
                        "Question_Id": q_id,
                        "Points": int(max_points),
                        "Awarded_Points": 0.0,
                        "Classification_Level": "N/A",
                        "Classification_Confidence": 0.0,
                        "Classification_Description": "Empty answer",
                        "Feedback_Overall_Score": 0.0,
                        "Feedback_Grammar_Score": 0.0,
                        "Feedback_Vocab_Score": 0.0,
                        "Feedback_Punct_Score": 0.0,
                        "Feedback_Corrected_Text": "",
                        "Feedback_Detected_Issues": ["No answer provided"],
                        "Feedback_Errors": [],
                        "Feedback_Error_Trend": "",
                        "Feedback_Dominant_Error": "",
                        "Answer_Text": "",
                    }
                    results.append(Question_Evaluation_Type(**item))
                    question_results_payload.append(item)
                    continue

                non_empty_answers.append(answer_text)

                class_data = classifier.Classify_Text(
                    Text=answer_text,
                    Return_Probabilities=True,
                )
                feedback_data = feedback_analyzer.Analyze_Text(Text=answer_text)

                level = class_data.get("level", "A1")
                confidence = float(class_data.get("confidence", 0.0))
                word_count = int(class_data.get("word_count", max(1, len(answer_text.split()))))
                probs = normalize_probabilities(
                    class_data.get("probabilities"),
                    fallback_level=level,
                    fallback_confidence=confidence,
                )

                reliability_weight = (
                    max_points
                    * clamp(word_count / 80.0, 0.4, 1.2)
                    * clamp(confidence, 0.5, 1.0)   # confidence is 0–1 from softmax
                )

                answer_metrics.append(
                    {
                        "probs": probs,
                        "weight": reliability_weight,
                    }
                )

                question_text = question_text_by_id.get(q_id, "")
                language_score = compute_language_score(feedback_data)
                relevance_score = compute_relevance_score(question_text, answer_text)
                completeness_score = compute_completeness_score(question_text, answer_text)

                final_question_score = (
                    0.5 * language_score
                    + 0.3 * relevance_score
                    + 0.2 * completeness_score
                )

                awarded = round(max_points * clamp(final_question_score / 100.0, 0.0, 1.0), 2)
                total_awarded += awarded

                item = {
                    "Question_Id": q_id,
                    "Points": int(max_points),
                    "Awarded_Points": awarded,
                    "Classification_Level": level,
                    "Classification_Confidence": round(confidence * 100.0, 2),
                    "Classification_Description": class_data.get("description", "N/A"),
                    "Feedback_Overall_Score": float(feedback_data.get("overall_score", 0.0)),
                    "Feedback_Grammar_Score": float(feedback_data.get("grammar_score", 0.0)),
                    "Feedback_Vocab_Score": float(feedback_data.get("vocab_score", 0.0)),
                    "Feedback_Punct_Score": float(feedback_data.get("punct_score", 0.0)),
                    "Feedback_Corrected_Text": feedback_data.get("corrected", answer_text),
                    "Feedback_Detected_Issues": feedback_data.get("detected_issues", []),
                    "Feedback_Errors": feedback_data.get("errors", []),
                    "Feedback_Error_Trend": feedback_data.get("error_trend", ""),
                    "Feedback_Dominant_Error": feedback_data.get("dominant_error", ""),
                    "Answer_Text": answer_text,
                }

                results.append(Question_Evaluation_Type(**item))
                question_results_payload.append(item)

            percentage = round((total_awarded / total_points) * 100.0, 2) if total_points > 0 else 0.0

            final_level = "A1"
            final_confidence = 0.0

            if answer_metrics:
                agg_probs, top1, _, margin = aggregate_exam_level(answer_metrics)
                borderline = margin < 0.08

                previous_level = None
                previous = (
                    Classification_Level.objects
                    .filter(User_Id=User_Id)
                    .order_by("-Created_At")
                    .first()
                )
                if previous and previous.Level in LEVELS:
                    previous_level = previous.Level

                if borderline:
                    if previous_level:
                        final_level = previous_level
                    else:
                        final_level = nearest_lower_level(top1)
                else:
                    final_level = top1

                final_confidence = round(agg_probs.get(final_level, agg_probs.get(top1, 0.0)) * 100.0, 2)
                agg_probs_percent = {lv: round(agg_probs[lv] * 100.0, 2) for lv in LEVELS}
            else:
                agg_probs_percent = {lv: (100.0 / len(LEVELS)) for lv in LEVELS}

            if Save_To_Database and non_empty_answers:
                full_exam_text = "\n\n".join(non_empty_answers)

                desc = (
                    "Exam level derived from weighted probability aggregation across answers. "
                )

                Classification_Level.objects.create(
                    User_Id=User_Id,
                    Text=full_exam_text,
                    Level=final_level,
                    Confidence=final_confidence,
                    Description=desc,
                    Text_Length=len(full_exam_text),
                    Word_Count=len(full_exam_text.split()),
                    Probabilities=agg_probs_percent,
                )

                exam_feedback = feedback_analyzer.Analyze_Text(Text=full_exam_text)

                Feedback_Result.objects.create(
                    User_Id=User_Id,
                    Text=exam_feedback.get("text", full_exam_text),
                    Corrected=exam_feedback.get("corrected", full_exam_text),
                    Overall_Score=float(exam_feedback.get("overall_score", percentage)),
                    Grammar_Score=float(exam_feedback.get("grammar_score", 0.0)),
                    Vocab_Score=float(exam_feedback.get("vocab_score", 0.0)),
                    Punct_Score=float(exam_feedback.get("punct_score", 0.0)),
                    Detected_Issues=exam_feedback.get("detected_issues", []),
                )

            submitted_at_str = None
            auto_submitted = False

            if Save_To_Database and attempt:
                now = timezone.now()

                attempt.Answers = stored_answers
                attempt.Question_Results = question_results_payload
                attempt.Total_Points = round(total_points, 2)
                attempt.Total_Score = round(total_awarded, 2)
                attempt.Percentage = percentage
                attempt.Passed = percentage >= pass_threshold
                attempt.Submitted_At = now
                attempt.Auto_Submitted = bool(is_expired)
                attempt.Status = "AUTO_SUBMITTED" if is_expired else "SUBMITTED"
                attempt.Final_Level = final_level
                attempt.Final_Confidence = float(final_confidence)
                attempt.save()

                submitted_at_str = str(now)
                auto_submitted = bool(is_expired)

            return Evaluate_Exam_Mutation(
                Success=True,
                AI_Detected=False,
                Attempt_Id=Attempt_Id,
                Submitted_At=submitted_at_str,
                Is_Expired=bool(is_expired),
                Auto_Submitted=auto_submitted,
                Final_Level=final_level,
                Final_Confidence=float(final_confidence),
                Total_Score=round(total_awarded, 2),
                Percentage=percentage,
                Passed=percentage >= pass_threshold,
                Question_Results=results,
            )

        except Exception as e:
            # Mark the attempt CANCELLED so it never appears in history
            if Attempt_Id:
                try:
                    Exam_Attempt.objects.filter(
                        Attempt_Id=Attempt_Id, User_Id=User_Id
                    ).update(Status="CANCELLED")
                except Exception:
                    pass
            return Evaluate_Exam_Mutation(
                Success=False,
                AI_Detected=False,
                Error="Failed to evaluate exam: " + str(e),
            )


class Query(ObjectType):
    Exam_Health_Check = Field(Boolean)
    Get_Exam_Attempt = Field(Exam_Attempt_Type, Attempt_Id=String(required=True))
    Get_User_Exam_Attempts = List(
        Exam_Attempt_Type,
        User_Id=String(required=True),
        Limit=Int(default_value=10),
    )

    def resolve_Exam_Health_Check(self, info):
        try:
            _ = Get_Classifier()
            _ = Get_Feedback_Analyzer()
            return True
        except Exception:
            return False

    def resolve_Get_Exam_Attempt(self, info, Attempt_Id):
        attempt = Exam_Attempt.objects.filter(Attempt_Id=Attempt_Id).first()
        if not attempt:
            return None
        return convert_attempt_to_type(attempt)

    @require_auth
    def resolve_Get_User_Exam_Attempts(self, info, User_Id, Limit=10):
        # Only return properly completed attempts — never IN_PROGRESS, CANCELLED, or AI_DETECTED
        valid_statuses = ["SUBMITTED", "AUTO_SUBMITTED"]
        attempts = (
            Exam_Attempt.objects
            .filter(User_Id=User_Id, Status__in=valid_statuses)
            .order_by("-Created_At")[:max(1, Limit)]
        )
        return [convert_attempt_to_type(a) for a in attempts]


class Mutation(ObjectType):
    Generate_Exam_Questions = Generate_Exam_Questions_Mutation.Field()
    Evaluate_Exam = Evaluate_Exam_Mutation.Field()