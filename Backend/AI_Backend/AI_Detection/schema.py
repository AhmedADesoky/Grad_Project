import graphene
from graphene import ObjectType, String, Float, Boolean, Field, Mutation
import logging

Logger = logging.getLogger(__name__)


class AI_Detection_Result_Type(ObjectType):
    Label = String()
    Confidence = Float()
    Human_Probability = Float()
    AI_Probability = Float()


class Detect_AI_Mutation(Mutation):
    class Arguments:
        Text = String(required=True)

    Success = Boolean()
    Result = Field(AI_Detection_Result_Type)
    Error = String()

    def mutate(self, info, Text):
        try:
            if not Text or not Text.strip():
                return Detect_AI_Mutation(
                    Success=False,
                    Error="Text field is required and cannot be empty"
                )

            from .services.AI_Detector import Get_Detector
            detector = Get_Detector()
            data = detector.predict(Text)

            result = AI_Detection_Result_Type(
                Label=data["label"],
                Confidence=data["confidence"],
                Human_Probability=data["human_probability"],
                AI_Probability=data["ai_probability"],
            )
            return Detect_AI_Mutation(Success=True, Result=result)

        except ValueError as e:
            Logger.error("AI detection validation error: %s", e)
            return Detect_AI_Mutation(Success=False, Error=str(e))
        except Exception as e:
            Logger.error("AI detection error: %s", e)
            return Detect_AI_Mutation(
                Success=False,
                Error=f"An error occurred during AI detection: {str(e)}"
            )


class Query(ObjectType):
    AI_Detection_Health = Boolean()

    def resolve_AI_Detection_Health(self, info):
        try:
            from .services.AI_Detector import is_available, Get_Detector
            if not is_available():
                return False
            Get_Detector()
            return True
        except Exception:
            return False


class Mutation(ObjectType):
    Detect_AI = Detect_AI_Mutation.Field()
