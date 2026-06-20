import os
import json
import glob
import logging
from datetime import datetime

from pymongo import MongoClient, UpdateOne
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

load_dotenv()
Logger = logging.getLogger(__name__)


def load_jsonl(path):
    items = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            items.append(json.loads(line))
    return items


def embed_texts(model, texts):
    return [model.encode(text).tolist() for text in texts]


def ingest_jsonl_files(
    input_glob,
    mongo_uri,
    db_name="Rag",
    collection_name="Chunks",
    embedding_model="sentence-transformers/all-MiniLM-L6-v2",
    batch_size=64
):
    if not mongo_uri:
        raise ValueError("MONGODB_URI or MONGO_URL is required")

    model = SentenceTransformer(embedding_model)
    mongo = MongoClient(mongo_uri)
    coll = mongo[db_name][collection_name]

    files = glob.glob(input_glob)
    if not files:
        raise ValueError(f"No files found for {input_glob}")

    for path in files:
        items = load_jsonl(path)
        Logger.info("Loaded %s items from %s", len(items), path)

        for i in range(0, len(items), batch_size):
            batch = items[i:i + batch_size]
            texts = [b["text"] for b in batch]
            embeddings = embed_texts(model, texts)

            ops = []
            for item, vec in zip(batch, embeddings):
                doc = {
                    "id": item["id"],
                    "text": item["text"],
                    "cefr_level": item.get("cefr_level", "A1"),
                    "chunk_type": item.get("chunk_type", "writing_rule"),
                    "skill": item.get("skill", "general"),
                    "source": item.get("source", "custom"),
                    "embedding": vec,
                    "updated_at": datetime.utcnow().isoformat() + "Z"
                }
                ops.append(
                    UpdateOne({"id": doc["id"]}, {"$set": doc}, upsert=True)
                )

            if ops:
                coll.bulk_write(ops, ordered=False)
                Logger.info("Upserted %s chunks", len(ops))


if __name__ == "__main__":
    mongo_uri = os.getenv("MONGODB_URI") or os.getenv("MONGO_URL")
    ingest_jsonl_files(
        input_glob=os.getenv("RAG_INPUT_GLOB", "data/rag_chunks/*.jsonl"),
        mongo_uri=mongo_uri,
        db_name=os.getenv("MONGODB_DB", "Rag"),
        collection_name=os.getenv("RAG_COLLECTION", "Chunks"),
        embedding_model=os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"),
        batch_size=int(os.getenv("EMBED_BATCH", "64"))
    )