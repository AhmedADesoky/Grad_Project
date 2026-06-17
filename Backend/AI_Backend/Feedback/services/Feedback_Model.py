"""
Feedback analyzer service.
Loads grammar correction model from the results folder and computes
grammar, vocabulary, and punctuation scores.
"""

import json
import logging
import re
from difflib import SequenceMatcher
from pathlib import Path

import torch
from transformers import T5ForConditionalGeneration, T5Tokenizer

Logger = logging.getLogger(__name__)


def _Clamp(Value, Min_Value=0.0, Max_Value=100.0):
    return max(Min_Value, min(Max_Value, Value))


class Feedback_Analyzer:

    DEFAULT_WEIGHTS = {
        "grammar": 0.45,
        "vocabulary": 0.30,
        "punctuation": 0.25,
    }

    def __init__(self, Model_Path=None, Config_Path=None):
        Base_Dir = Path(__file__).resolve().parent.parent.parent.parent.parent

        if Model_Path is None:
            Model_Path = Base_Dir / "results" / "english_analyzer_model" / "t5_grammar"

        if Config_Path is None:
            Config_Path = Base_Dir / "results" / "english_analyzer_model" / "config.json"

        self.Model_Path = Path(Model_Path)
        self.Config_Path = Path(Config_Path)

        self.Config = self._Load_Config()
        self.Weights = self.Config.get("weights", self.DEFAULT_WEIGHTS)

        Requested_Device = str(self.Config.get("device", "cuda")).lower()
        if Requested_Device == "cuda" and torch.cuda.is_available():
            self.Device = torch.device("cuda")
        else:
            self.Device = torch.device("cpu")

        self.Model = None
        self.Tokenizer = None

        Logger.info(f"Loading feedback analyzer model from: {self.Model_Path}")
        Logger.info(f"Using device: {self.Device}")

        self._Load_Model()

    def _Load_Config(self):
        if not self.Config_Path.exists():
            Logger.warning("Feedback config not found, using defaults")
            return {
                "version": "unknown",
                "device": "cpu",
                "t5_available": False,
                "weights": self.DEFAULT_WEIGHTS,
            }

        try:
            with self.Config_Path.open("r", encoding="utf-8") as Config_File:
                return json.load(Config_File)
        except Exception as E:
            Logger.error(f"Failed to read feedback config: {str(E)}")
            return {
                "version": "unknown",
                "device": "cpu",
                "t5_available": False,
                "weights": self.DEFAULT_WEIGHTS,
            }

    def _Load_Model(self):
        try:
            self.Tokenizer = T5Tokenizer.from_pretrained(
                str(self.Model_Path),
                local_files_only=True
            )

            self.Model = T5ForConditionalGeneration.from_pretrained(
                str(self.Model_Path),
                local_files_only=True,
                low_cpu_mem_usage=False,  # ← prevents meta-device allocation for missing tied weights
            )

            # Re-bind shared embedding matrices (encoder/decoder/lm_head all share one weight tensor)
            self.Model.tie_weights()

            self.Model.to(self.Device)
            self.Model.eval()

            Logger.info("Feedback model and tokenizer loaded successfully")
            Logger.info(f"Model on device: {next(self.Model.parameters()).device}")
        except Exception as E:
            Logger.error(f"Error loading feedback model: {str(E)}")
            raise RuntimeError(f"Failed to load feedback model: {str(E)}")

    def _Split_Into_Sentences(self, Text):
        Sentences = re.split(r"(?<=[.!?])\s+", (Text or "").strip())
        Sentences = [S.strip() for S in Sentences if S and S.strip()]
        if not Sentences and (Text or "").strip():
            return [(Text or "").strip()]
        return Sentences

    def _Split_Text_Into_Chunks(self, Text, Max_Tokens=220):
        Sentences = self._Split_Into_Sentences(Text)
        if not Sentences:
            return [Text.strip()] if Text and Text.strip() else []

        Chunks = []
        Current = []
        Current_Tokens = 0

        for Sentence in Sentences:
            Sentence_Tokens = len(self.Tokenizer.encode(Sentence, add_special_tokens=False))

            if Sentence_Tokens > Max_Tokens:
                Words = Sentence.split()
                Sub_Current = []
                Sub_Tokens = 0

                for Word in Words:
                    Word_Tokens = len(self.Tokenizer.encode(Word + " ", add_special_tokens=False))
                    if Sub_Current and (Sub_Tokens + Word_Tokens) > Max_Tokens:
                        Chunks.append(" ".join(Sub_Current).strip())
                        Sub_Current = [Word]
                        Sub_Tokens = Word_Tokens
                    else:
                        Sub_Current.append(Word)
                        Sub_Tokens += Word_Tokens

                if Sub_Current:
                    Chunks.append(" ".join(Sub_Current).strip())
                continue

            if Current and (Current_Tokens + Sentence_Tokens) > Max_Tokens:
                Chunks.append(" ".join(Current).strip())
                Current = [Sentence]
                Current_Tokens = Sentence_Tokens
            else:
                Current.append(Sentence)
                Current_Tokens += Sentence_Tokens

        if Current:
            Chunks.append(" ".join(Current).strip())

        return [C for C in Chunks if C]

    def _Correct_Chunk(self, Chunk_Text):
        Prompt = f"gec: {Chunk_Text.strip()}"

        Inputs = self.Tokenizer(
            Prompt,
            return_tensors="pt",
            truncation=True,
            max_length=256,
            padding=True,
        )
        Inputs = {K: V.to(self.Device) for K, V in Inputs.items()}

        with torch.no_grad():
            Output_Ids = self.Model.generate(
                **Inputs,
                max_new_tokens=256,
                num_beams=4,
                early_stopping=True,
                no_repeat_ngram_size=2,
            )

        Corrected = self.Tokenizer.decode(Output_Ids[0], skip_special_tokens=True).strip()
        return Corrected if Corrected else Chunk_Text

    def _Looks_Truncated(self, Original, Corrected):
        Original = (Original or "").strip()
        Corrected = (Corrected or "").strip()

        if not Corrected:
            return True

        Original_Words = len(self._Word_Tokens(Original))
        Corrected_Words = len(self._Word_Tokens(Corrected))

        if Original_Words >= 12 and Corrected_Words < max(4, int(Original_Words * 0.45)):
            return True

        if (
            Original
            and Original[-1] in ".!?"
            and Corrected
            and Corrected[-1] not in ".!?"
            and Corrected_Words < max(5, int(Original_Words * 0.9))
        ):
            return True

        return False

    def _Correct_Grammar(self, Text):
        Clean_Text = (Text or "").strip()
        if not Clean_Text:
            return Text

        Chunks = self._Split_Text_Into_Chunks(Clean_Text, Max_Tokens=220)
        if not Chunks:
            return Clean_Text

        Corrected_Chunks = []

        for Chunk in Chunks:
            Corrected_Chunk = self._Correct_Chunk(Chunk)

            if self._Looks_Truncated(Chunk, Corrected_Chunk):
                Corrected_Chunk = Chunk

            Corrected_Chunks.append(Corrected_Chunk)

        Corrected_Full = " ".join(Corrected_Chunks).strip()
        if not Corrected_Full:
            return Clean_Text

        Original_Total = len(self._Word_Tokens(Clean_Text))
        Corrected_Total = len(self._Word_Tokens(Corrected_Full))

        if Original_Total >= 20 and Corrected_Total < int(Original_Total * 0.55):
            return Clean_Text

        return Corrected_Full

    def _Word_Tokens(self, Text):
        return re.findall(r"[A-Za-z']+", Text.lower())

    def _Normalize_For_Compare(self, Text):
        return re.sub(r"\s+", " ", Text.strip().lower())

    def _Count_Punctuation_Issues(self, Text):
        Issues = 0
        Clean = Text.strip()

        if re.search(r",\S", Clean):
            Issues += 1

        if re.search(r"\s+[,.!?;:]", Clean):
            Issues += 1

        if len(Clean) > 40 and not re.search(r"[.!?]", Clean):
            Issues += 1

        if Clean and not Clean.endswith((".", "!", "?")):
            Issues += 1

        Sentences = [S.strip() for S in re.split(r"[.!?]+", Clean) if S.strip()]
        for Sentence in Sentences:
            if Sentence and Sentence[0].isalpha() and not Sentence[0].isupper():
                Issues += 1

        return Issues

    def _Compute_Grammar_Score(self, Original, Corrected):
        Similarity = SequenceMatcher(None, Original, Corrected).ratio()
        Length_Penalty = abs(len(Corrected) - len(Original)) / max(1, len(Original))
        Score = 50.0 + (Similarity * 55.0) - (Length_Penalty * 12.0)
        return round(_Clamp(Score), 2)

    def _Compute_Vocab_Score(self, Text):
        Tokens = self._Word_Tokens(Text)
        if not Tokens:
            return 100.0

        Unique = len(set(Tokens))
        Total = len(Tokens)
        TTR = Unique / Total

        Frequencies = {}
        for Token in Tokens:
            Frequencies[Token] = Frequencies.get(Token, 0) + 1

        Max_Frequency = max(Frequencies.values()) if Frequencies else 1
        Repetition = Max_Frequency / Total
        Avg_Length = sum(len(T) for T in Tokens) / Total

        Score_01 = (0.45 * TTR) + (0.35 * (1.0 - Repetition)) + (0.20 * min(Avg_Length / 6.0, 1.0))
        return round(_Clamp(Score_01 * 100.0), 2)

    def _Compute_Punct_Score(self, Original, Corrected):
        Original_Issues = self._Count_Punctuation_Issues(Original)
        Corrected_Issues = self._Count_Punctuation_Issues(Corrected)

        Improvement = max(0, Original_Issues - Corrected_Issues)
        Score = 100.0 - (Corrected_Issues * 18.0) + (Improvement * 6.0)
        return round(_Clamp(Score), 2)

    def _Estimate_Edit_Stats(self, Original, Corrected):
        Original_Normalized = self._Normalize_For_Compare(Original)
        Corrected_Normalized = self._Normalize_For_Compare(Corrected)

        Char_Similarity = SequenceMatcher(None, Original_Normalized, Corrected_Normalized).ratio()

        Original_Tokens = self._Word_Tokens(Original_Normalized)
        Corrected_Tokens = self._Word_Tokens(Corrected_Normalized)

        Token_Matcher = SequenceMatcher(None, Original_Tokens, Corrected_Tokens)
        Token_Edits = 0
        for Tag, I1, I2, J1, J2 in Token_Matcher.get_opcodes():
            if Tag != "equal":
                Token_Edits += max(I2 - I1, J2 - J1)

        Correction_Applied = Original_Normalized != Corrected_Normalized
        Substantial_Edit = Char_Similarity < 0.97 or Token_Edits >= 2

        return {
            "correction_applied": Correction_Applied,
            "char_similarity": round(Char_Similarity, 4),
            "token_edits": int(Token_Edits),
            "substantial_edit": Substantial_Edit,
        }

    def _Infer_Issues(self, Original, Grammar_Score, Vocab_Score, Punct_Score, Edit_Stats):
        Issues = []

        # Grammar: score-first, then correction-size for borderline cases.
        if Grammar_Score < 85.0:
            Issues.append("grammar")
        elif Grammar_Score < 92.0 and Edit_Stats.get("substantial_edit", False):
            Issues.append("grammar")

        # Vocabulary: slightly relaxed threshold for very short responses.
        Token_Count = len(self._Word_Tokens(Original))
        Vocab_Threshold = 65.0 if Token_Count < 6 else 70.0
        if Vocab_Score < Vocab_Threshold:
            Issues.append("vocabulary")

        # Punctuation: strict for low scores, evidence-aware for borderline scores.
        Original_Punct_Issues = self._Count_Punctuation_Issues(Original)
        if Punct_Score < 80.0:
            Issues.append("punctuation")
        elif Punct_Score < 88.0 and Original_Punct_Issues > 0:
            Issues.append("punctuation")

        return Issues

    def _Infer_Rule_Issues(self, Original, Corrected):
        issues = set()
        orig = (Original or "").lower()
        corr = (Corrected or "").lower()

        article_set = {"a", "an", "the"}
        prep_set = {"in", "on", "at", "to", "for", "of"}

        orig_tokens = re.findall(r"[a-z']+|[.,!?;:]", orig)
        corr_tokens = re.findall(r"[a-z']+|[.,!?;:]", corr)
        matcher = SequenceMatcher(None, orig_tokens, corr_tokens)

        for op, i1, i2, j1, j2 in matcher.get_opcodes():
            if op == "equal":
                continue
            old = orig_tokens[i1:i2]
            new = corr_tokens[j1:j2]
            if any(t in article_set for t in old + new):
                issues.add("articles")
            if any(t in prep_set for t in old + new):
                issues.add("prepositions")

        if re.search(r"\b(am|is|are|was|were|be|been|being)\b\s+\w+(ed|en)\b", orig) != \
           re.search(r"\b(am|is|are|was|were|be|been|being)\b\s+\w+(ed|en)\b", corr):
            issues.add("voice")

        if re.search(r"\b(is|are|do|does|have|has)\b", orig) and re.search(r"\b(was|were|did|had)\b", corr):
            issues.add("tense")
        if re.search(r"\b(was|were|did|had)\b", orig) and re.search(r"\b(is|are|do|does|have|has)\b", corr):
            issues.add("tense")

        return sorted(issues)

    def Analyze_Text(self, Text):
        if not Text or not Text.strip():
            raise ValueError("Text cannot be empty")

        try:
            Clean_Text = Text.strip()
            Corrected = self._Correct_Grammar(Clean_Text)

            Grammar_Score = self._Compute_Grammar_Score(Clean_Text, Corrected)
            Vocab_Score = self._Compute_Vocab_Score(Clean_Text)
            Punct_Score = self._Compute_Punct_Score(Clean_Text, Corrected)

            Edit_Stats = self._Estimate_Edit_Stats(Clean_Text, Corrected)

            Overall_Score = (
                Grammar_Score * float(self.Weights.get("grammar", 0.45))
                + Vocab_Score * float(self.Weights.get("vocabulary", 0.30))
                + Punct_Score * float(self.Weights.get("punctuation", 0.25))
            )

            Detected_Issues = self._Infer_Issues(
                Original=Clean_Text,
                Grammar_Score=Grammar_Score,
                Vocab_Score=Vocab_Score,
                Punct_Score=Punct_Score,
                Edit_Stats=Edit_Stats,
            )

            Rule_Issues = self._Infer_Rule_Issues(Clean_Text, Corrected)
            if Rule_Issues:
                Detected_Issues = sorted(set(Detected_Issues + Rule_Issues))

            Result = {
                "text": Clean_Text,
                "corrected": Corrected,
                "overall_score": round(_Clamp(Overall_Score), 2),
                "grammar_score": Grammar_Score,
                "vocab_score": Vocab_Score,
                "punct_score": Punct_Score,
                "detected_issues": Detected_Issues,
                "correction_applied": Edit_Stats["correction_applied"],
                "correction_summary": {
                    "char_similarity": Edit_Stats["char_similarity"],
                    "token_edits": Edit_Stats["token_edits"],
                    "substantial_edit": Edit_Stats["substantial_edit"],
                },
            }

            Logger.info(
                "Feedback analyzed successfully with overall score %.2f",
                Result["overall_score"],
            )

            return Result
        except Exception as E:
            Logger.error(f"Error during feedback analysis: {str(E)}")
            raise RuntimeError(f"Failed to analyze feedback: {str(E)}")

    def Analyze_Batch(self, Texts):
        Results = []
        for Text in Texts:
            try:
                Results.append(self.Analyze_Text(Text))
            except Exception as E:
                Logger.error(f"Error analyzing text: {str(E)}")
                Results.append(
                    {
                        "error": str(E),
                        "text": Text[:100] + "..." if len(Text) > 100 else Text,
                    }
                )
        return Results

    def Get_Model_Info(self):
        return {
            "model_path": str(self.Model_Path),
            "device": str(self.Device),
            "model_type": "T5 Feedback Analyzer",
            "weights": self.Weights,
            "t5_available": bool(self.Config.get("t5_available", True)),
            "model_loaded": self.Model is not None and self.Tokenizer is not None,
        }


_Feedback_Analyzer_Instance = None


def Get_Feedback_Analyzer():
    global _Feedback_Analyzer_Instance

    if _Feedback_Analyzer_Instance is None:
        Logger.info("Creating new feedback analyzer instance")
        _Feedback_Analyzer_Instance = Feedback_Analyzer()

    return _Feedback_Analyzer_Instance