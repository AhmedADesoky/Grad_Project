"""
DistilBERT CEFR Text Classifier Service
Loads and uses the pre-trained DistilBERT model for CEFR level classification
"""

import os
from pathlib import Path
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer
import logging

Logger = logging.getLogger(__name__)

CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]

_ENV_PATH = os.environ.get("CEFR_MODEL_PATH")
if _ENV_PATH:
    _DEFAULT_MODEL_PATH  = Path(_ENV_PATH)
    _FALLBACK_MODEL_PATH = Path(_ENV_PATH)
else:
    _DEFAULT_MODEL_PATH  = Path(__file__).resolve().parent.parent.parent.parent.parent / "Models_Weights" / "Classifications" / "cefr_wi_roberta"
    _FALLBACK_MODEL_PATH = Path(__file__).resolve().parent.parent.parent.parent.parent / "Models_Weights" / "Classifications" / "model"


class CEFR_Classifier:

    CEFR_LEVELS = {
        0: "A1",
        1: "A2",
        2: "B1",
        3: "B2",
        4: "C1",
        5: "C2"
    }

    LEVEL_DESCRIPTIONS = {
        "A1": "Beginner - Can understand and use familiar everyday expressions",
        "A2": "Elementary - Can communicate in simple routine tasks",
        "B1": "Intermediate - Can deal with most situations while traveling",
        "B2": "Upper Intermediate - Can interact with fluency and spontaneity",
        "C1": "Advanced - Can express ideas fluently and spontaneously",
        "C2": "Proficiency - Can understand virtually everything with ease"
    }

    def __init__(self, Model_Path=None):
        if Model_Path is None:
            if _DEFAULT_MODEL_PATH.exists():
                Model_Path = _DEFAULT_MODEL_PATH
            else:
                Logger.warning("RoBERTa weights not found — falling back to DistilBERT")
                Model_Path = _FALLBACK_MODEL_PATH

        self.Model_Path = Path(Model_Path)
        self.Device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        Logger.info(f"Loading CEFR Classifier from: {self.Model_Path}")
        Logger.info(f"Using device: {self.Device}")

        self.Model = None
        self.Tokenizer = None

        self._Load_Model()

    def _Load_Model(self):
        try:
            # AutoTokenizer + AutoModel handle RoBERTa, BERT, and DistilBERT
            # transparently based on the config.json in the model folder.
            self.Tokenizer = AutoTokenizer.from_pretrained(
                str(self.Model_Path),
                local_files_only=True
            )

            self.Model = AutoModelForSequenceClassification.from_pretrained(
                str(self.Model_Path),
                local_files_only=True
            )

            self.Model.to(self.Device)
            self.Model.eval()

            num_labels = self.Model.config.num_labels
            id2label   = self.Model.config.id2label

            if num_labels != 6:
                raise RuntimeError(
                    f"Model has {num_labels} labels but expected 6 (A1-C2). "
                    f"Wrong model loaded from: {self.Model_Path}"
                )

            # id2label keys may be int or str depending on the transformers version
            normalized = {int(k): v for k, v in id2label.items()}
            expected = {i: l for i, l in enumerate(CEFR_ORDER)}
            if normalized != expected:
                raise RuntimeError(
                    f"Model id2label mismatch.\n"
                    f"  Got:      {normalized}\n"
                    f"  Expected: {expected}\n"
                    f"Wrong model loaded from: {self.Model_Path}"
                )

            Logger.info("Model loaded and validated successfully")
            Logger.info(f"Model on device: {next(self.Model.parameters()).device}")

        except Exception as E:
            Logger.error(f"Error loading model: {str(E)}")
            raise RuntimeError(f"Failed to load CEFR classifier model: {str(E)}")
    
    def Classify_Text(self, Text, Return_Probabilities=False):
        if not Text or not Text.strip():
            raise ValueError("Text cannot be empty")
        
        try:
            Inputs = self.Tokenizer(
                Text,
                return_tensors="pt",
                truncation=True,
                max_length=256,
                padding='max_length'
            )
            
            Inputs = {K: V.to(self.Device) for K, V in Inputs.items()}
            
            with torch.no_grad():
                Outputs = self.Model(**Inputs)
                Logits = Outputs.logits
                Probabilities = torch.nn.functional.softmax(Logits, dim=-1)
            
            Predicted_Class = torch.argmax(Probabilities, dim=-1).item()
            Confidence = Probabilities[0][Predicted_Class].item()
            
            CEFR_Level = self.CEFR_LEVELS[Predicted_Class]
            Description = self.LEVEL_DESCRIPTIONS[CEFR_Level]
            
            Result = {
                "level": CEFR_Level,
                "confidence": round(Confidence, 4),
                "description": Description,
                "text_length": len(Text),
                "word_count": len(Text.split())
            }
            
            if Return_Probabilities:
                All_Probs = {}
                for Idx, Prob in enumerate(Probabilities[0].cpu().numpy()):
                    Level = self.CEFR_LEVELS[Idx]
                    All_Probs[Level] = round(float(Prob), 4)
                Result["probabilities"] = All_Probs
            
            Logger.info(f"Classified text as {CEFR_Level} with {Confidence:.2%} confidence")
            
            return Result
            
        except Exception as E:
            Logger.error(f"Error during classification: {str(E)}")
            raise RuntimeError(f"Failed to classify text: {str(E)}")
    
    def Classify_Batch(self, Texts, Return_Probabilities=False):
        Results = []
        for Text in Texts:
            try:
                Result = self.Classify_Text(Text, Return_Probabilities)
                Results.append(Result)
            except Exception as E:
                Logger.error(f"Error classifying text: {str(E)}")
                Results.append({
                    "error": str(E),
                    "text": Text[:100] + "..." if len(Text) > 100 else Text
                })
        
        return Results
    
    def Get_Model_Info(self):
        return {
            "model_path": str(self.Model_Path),
            "device": str(self.Device),
            "model_type": "DistilBERT",
            "num_labels": len(self.CEFR_LEVELS),
            "levels": list(self.CEFR_LEVELS.values()),
            "gpu_available": torch.cuda.is_available(),
            "model_loaded": self.Model is not None
        }


_Classifier_Instance = None


def Get_Classifier():
    global _Classifier_Instance
    
    if _Classifier_Instance is None:
        Logger.info("Creating new CEFR Classifier instance")
        _Classifier_Instance = CEFR_Classifier()
    
    return _Classifier_Instance
