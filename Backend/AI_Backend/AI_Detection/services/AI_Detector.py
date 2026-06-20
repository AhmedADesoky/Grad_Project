import logging
import warnings
from pathlib import Path

Logger = logging.getLogger(__name__)

_WEIGHTS = (
    Path(__file__).resolve().parents[4]
    / "Models_Weights" / "AI_Detection" / "AI_Detection_Model" / "AiDetection model"
)

try:
    import torch
    _torch_available = True
except ImportError:
    _torch_available = False
    Logger.warning("PyTorch not available — AI_Detector disabled")

try:
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    _transformers_available = True
except ImportError:
    _transformers_available = False
    Logger.warning("Transformers not available — AI_Detector disabled")

_DETECTOR_INSTANCE = None


def is_available() -> bool:
    return _torch_available and _transformers_available and _WEIGHTS.exists()


def Get_Detector():
    global _DETECTOR_INSTANCE
    if _DETECTOR_INSTANCE is None:
        _DETECTOR_INSTANCE = _AI_Detector()
    return _DETECTOR_INSTANCE


class _AI_Detector:
    _LABELS = {0: "human", 1: "ai"}
    _MAX_LENGTH = 512
    _STRIDE     = 256   # sliding-window overlap for texts > 512 tokens

    def __init__(self):
        if not is_available():
            raise RuntimeError("AI_Detector unavailable — PyTorch/transformers or weights missing")
        Logger.info("Loading AI Detection model (RoBERTa) from %s …", _WEIGHTS)
        self.tokenizer = AutoTokenizer.from_pretrained(str(_WEIGHTS))
        self.model     = AutoModelForSequenceClassification.from_pretrained(str(_WEIGHTS))
        self.device    = "cuda" if torch.cuda.is_available() else "cpu"
        self.model.to(self.device).eval()
        Logger.info("AI_Detector ready (device=%s)", self.device)

    def _predict_chunk(self, input_ids, attention_mask) -> tuple[float, float]:
        """Return (human_prob, ai_prob) for a single tokenised chunk."""
        inputs = {
            "input_ids":      input_ids.unsqueeze(0).to(self.device),
            "attention_mask": attention_mask.unsqueeze(0).to(self.device),
        }
        with torch.no_grad():
            logits = self.model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)[0]
        return float(probs[0]), float(probs[1])

    def predict(self, text: str) -> dict:
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")

        # truncation=False is intentional — long texts are handled by the sliding
        # window below, so we tokenize the full text first. Suppress the
        # HuggingFace max-length warning because we never pass the full sequence
        # to the model; chunks are always capped at _MAX_LENGTH.
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="Token indices sequence length is longer",
            )
            enc = self.tokenizer(
                text,
                return_tensors="pt",
                truncation=False,
                padding=False,
            )
        ids  = enc["input_ids"][0]
        mask = enc["attention_mask"][0]
        total_tokens = ids.size(0)

        if total_tokens <= self._MAX_LENGTH:
            # Short text — single forward pass
            ids_t  = ids[:self._MAX_LENGTH]
            mask_t = mask[:self._MAX_LENGTH]
            human_prob, ai_prob = self._predict_chunk(ids_t, mask_t)
        else:
            # Long text — sliding window, average AI probability across windows
            window_probs: list[float] = []
            start = 0
            while start < total_tokens:
                end    = min(start + self._MAX_LENGTH, total_tokens)
                hp, ap = self._predict_chunk(ids[start:end], mask[start:end])
                window_probs.append(ap)
                if end == total_tokens:
                    break
                start += self._STRIDE
            ai_prob    = sum(window_probs) / len(window_probs)
            human_prob = 1.0 - ai_prob

        pred_idx   = 1 if ai_prob >= 0.97 else 0
        label      = self._LABELS[pred_idx]
        confidence = ai_prob if pred_idx == 1 else human_prob

        return {
            "label":             label,
            "confidence":        round(confidence * 100, 2),
            "human_probability": round(human_prob * 100, 2),
            "ai_probability":    round(ai_prob    * 100, 2),
        }
