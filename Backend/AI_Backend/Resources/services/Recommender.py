import os
import logging
from pymongo import MongoClient

Logger = logging.getLogger(__name__)

_CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]

# Module-level singleton — loaded once, reused on every call
_embedding_model = None

def _get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        import warnings
        from sentence_transformers import SentenceTransformer
        model_name = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message=".*position_ids.*")
            _embedding_model = SentenceTransformer(model_name)
        Logger.info("SentenceTransformer loaded: %s", model_name)
    return _embedding_model


def _adjacent_levels(cefr_level: str) -> list[str]:
    """Return the level plus one band above and below."""
    idx = _CEFR_ORDER.index(cefr_level.upper()) if cefr_level.upper() in _CEFR_ORDER else 2
    return _CEFR_ORDER[max(0, idx - 1): idx + 2]


def _embed_text(text: str) -> list[float]:
    """Embed with the singleton model used to build the Atlas index."""
    return _get_embedding_model().encode(text).tolist()


def _vector_search(query_text: str, cefr_levels: list[str], top_k: int = 20) -> list[dict]:
    mongo_uri = os.getenv("MONGODB_URI") or os.getenv("MONGO_URL")
    if not mongo_uri:
        Logger.warning("MongoDB URI not set — resource recommendations unavailable")
        return []

    db_name         = os.getenv("MONGODB_DB", "Rag")
    collection_name = os.getenv("RAG_COLLECTION", "Chunks")
    index_name      = os.getenv("RAG_VECTOR_INDEX", "rag_vector_index")

    try:
        client = MongoClient(mongo_uri)
        coll   = client[db_name][collection_name]
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
        Logger.error("Atlas vector search failed: %s", e)
        return []


def _is_valid_chunk(chunk: dict) -> bool:
    """Filter out 404 pages and chunks without a usable URL."""
    url  = (chunk.get("url") or "").strip()
    text = (chunk.get("text") or "").lower()
    if not url:
        return False
    bad_signals = [
        "could not be found",
        "multiple choices",
        "document name you requested",
        "spam submission",
        "legal notice",
        "copyright",
    ]
    return not any(s in text for s in bad_signals)


def get_recommendations(issues: list, cefr_level: str, user_id: str = None, limit: int = 3) -> list[dict]:
    """
    Return up to `limit` resource recommendations from the Atlas Chunks collection.
    Each result: {title, url, description, source, skill, cefr_level}
    Falls back to a general CEFR-level query when no specific issues are provided.
    """
    if issues:
        issue_str  = ", ".join(str(i) for i in issues if i)
        query_text = (
            f"English writing resources for CEFR {cefr_level} learners. "
            f"Issues to address: {issue_str}. "
            "Provide explanations, examples, and practice exercises."
        )
    else:
        # No detected issues — recommend general resources for this CEFR level
        query_text = (
            f"English writing practice and grammar resources for CEFR {cefr_level} level. "
            "Grammar rules, vocabulary building, writing skills, punctuation exercises."
        )

    cefr_levels = _adjacent_levels(cefr_level)
    chunks      = _vector_search(query_text, cefr_levels, top_k=30)

    # Deduplicate by URL, keep highest-scoring chunk per URL
    seen_urls: dict[str, dict] = {}
    for chunk in chunks:
        if not _is_valid_chunk(chunk):
            continue
        url = chunk["url"]
        if url not in seen_urls or chunk.get("score", 0) > seen_urls[url].get("score", 0):
            seen_urls[url] = chunk

    ranked = sorted(seen_urls.values(), key=lambda c: c.get("score", 0), reverse=True)

    results = []
    for chunk in ranked[:limit]:
        results.append({
            "title":       chunk.get("title") or _skill_to_title(chunk.get("skill", "")),
            "url":         chunk["url"],
            "description": _trim(chunk.get("text", ""), 200),
            "source":      chunk.get("source", ""),
            "skill":       chunk.get("skill", ""),
            "cefr_level":  chunk.get("cefr_level", cefr_level),
        })

    return results


def track_click(user_id: str, resource_url: str):
    """Stub kept for API compatibility."""
    pass


# ── helpers ───────────────────────────────────────────────────────────────────

_SKILL_TITLES = {
    "writing_grammar":     "Grammar Writing Guide",
    "writing_process":     "Writing Process Guide",
    "paragraph_structure": "Paragraph Structure Guide",
    "tense_usage":         "Tense Usage Guide",
    "punctuation":         "Punctuation Guide",
    "vocabulary":          "Vocabulary Resource",
}


def _skill_to_title(skill: str) -> str:
    return _SKILL_TITLES.get(skill, "English Writing Resource")


def _trim(text: str, limit: int) -> str:
    import re
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit] + "…" if len(text) > limit else text
