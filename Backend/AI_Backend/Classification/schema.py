import graphene
from graphene import ObjectType, String, Float, Int, Boolean, List, Field, Mutation
from .services.DistilBERT_Classifier import Get_Classifier
from .models import Classification_Level
import logging
from datetime import timedelta
from django.utils import timezone
from middleware.auth import require_auth

Logger = logging.getLogger(__name__)


def Convert_Classification_To_Type(Classification):
    return Classification_Level_Type(
        Id=str(Classification._id),
        User_Id=Classification.User_Id,
        Text=Classification.Text,
        Level=Classification.Level,
        Confidence=Classification.Confidence,
        Description=Classification.Description,
        Text_Length=Classification.Text_Length,
        Word_Count=Classification.Word_Count,
        Probabilities=Classification.Probabilities,
        Created_At=str(Classification.Created_At)
    )


class Probability_Type(ObjectType):
    A1 = Float()
    A2 = Float()
    B1 = Float()
    B2 = Float()
    C1 = Float()
    C2 = Float()


class Classification_Result(ObjectType):
    Level = String()
    Confidence = Float()
    Description = String()
    Text_Length = Int()
    Word_Count = Int()
    Probabilities = Field(Probability_Type)


class Batch_Classification_Result(ObjectType):
    Count = Int()
    Results = List(Classification_Result)


class Model_Info_Type(ObjectType):
    Model_Path = String()
    Device = String()
    Model_Type = String()
    Num_Labels = Int()
    Levels = List(String)
    GPU_Available = Boolean()
    Model_Loaded = Boolean()


class Classification_Level_Type(ObjectType):
    Id = String()
    User_Id = String()
    Text = String()
    Level = String()
    Confidence = Float()
    Description = String()
    Text_Length = Int()
    Word_Count = Int()
    Probabilities = graphene.JSONString()
    Created_At = String()


class Classify_Text_Mutation(Mutation):
    class Arguments:
        Text = String(required=True)
        Include_Probabilities = Boolean(default_value=False)
        User_Id = String(required=False)
        Save_To_Database = Boolean(default_value=False)

    Success = Boolean()
    Result = Field(Classification_Result)
    Saved_Classification = Field(Classification_Level_Type)
    Error = String()

    @require_auth
    def mutate(self, info, Text, Include_Probabilities=False, User_Id=None, Save_To_Database=False):
        try:
            if not Text or not Text.strip():
                return Classify_Text_Mutation(
                    Success=False,
                    Error="Text field is required and cannot be empty"
                )

            Classifier = Get_Classifier()
            Result_Data = Classifier.Classify_Text(
                Text=Text,
                Return_Probabilities=Include_Probabilities
            )

            Probs = None
            if Include_Probabilities and "probabilities" in Result_Data:
                Prob_Dict = Result_Data["probabilities"]
                Probs = Probability_Type(
                    A1=Prob_Dict.get("A1", 0.0),
                    A2=Prob_Dict.get("A2", 0.0),
                    B1=Prob_Dict.get("B1", 0.0),
                    B2=Prob_Dict.get("B2", 0.0),
                    C1=Prob_Dict.get("C1", 0.0),
                    C2=Prob_Dict.get("C2", 0.0)
                )

            Result = Classification_Result(
                Level=Result_Data["level"],
                Confidence=Result_Data["confidence"],
                Description=Result_Data["description"],
                Text_Length=Result_Data["text_length"],
                Word_Count=Result_Data["word_count"],
                Probabilities=Probs
            )

            Saved_Class = None
            if Save_To_Database and User_Id:
                Classification_Model = Classification_Level.objects.create(
                    User_Id=User_Id,
                    Text=Text,
                    Level=Result_Data["level"],
                    Confidence=Result_Data["confidence"],
                    Description=Result_Data["description"],
                    Text_Length=Result_Data["text_length"],
                    Word_Count=Result_Data["word_count"],
                    Probabilities=Result_Data.get("probabilities")
                )
                Saved_Class = Convert_Classification_To_Type(Classification_Model)

            return Classify_Text_Mutation(
                Success=True,
                Result=Result,
                Saved_Classification=Saved_Class
            )

        except ValueError as E:
            Logger.error(f"Validation error: {str(E)}")
            return Classify_Text_Mutation(Success=False, Error=str(E))
        except Exception as E:
            Logger.error(f"Classification error: {str(E)}")
            return Classify_Text_Mutation(
                Success=False,
                Error=f"An error occurred during classification: {str(E)}"
            )


class Classify_Batch_Mutation(Mutation):
    class Arguments:
        Texts = List(String, required=True)
        Include_Probabilities = Boolean(default_value=False)

    Success = Boolean()
    Result = Field(Batch_Classification_Result)
    Error = String()

    def mutate(self, info, Texts, Include_Probabilities=False):
        try:
            if not Texts or not isinstance(Texts, list):
                return Classify_Batch_Mutation(
                    Success=False,
                    Error="Texts field is required and must be a list"
                )

            if len(Texts) == 0:
                return Classify_Batch_Mutation(
                    Success=False,
                    Error="Texts list cannot be empty"
                )

            if len(Texts) > 50:
                return Classify_Batch_Mutation(
                    Success=False,
                    Error="Maximum 50 texts allowed per request"
                )

            Classifier = Get_Classifier()
            Results_Data = Classifier.Classify_Batch(
                Texts=Texts,
                Return_Probabilities=Include_Probabilities
            )

            Results = []
            for Result_Data in Results_Data:
                if "error" in Result_Data:
                    continue

                Probs = None
                if Include_Probabilities and "probabilities" in Result_Data:
                    Prob_Dict = Result_Data["probabilities"]
                    Probs = Probability_Type(
                        A1=Prob_Dict.get("A1", 0.0),
                        A2=Prob_Dict.get("A2", 0.0),
                        B1=Prob_Dict.get("B1", 0.0),
                        B2=Prob_Dict.get("B2", 0.0),
                        C1=Prob_Dict.get("C1", 0.0),
                        C2=Prob_Dict.get("C2", 0.0)
                    )

                Result = Classification_Result(
                    Level=Result_Data["level"],
                    Confidence=Result_Data["confidence"],
                    Description=Result_Data["description"],
                    Text_Length=Result_Data["text_length"],
                    Word_Count=Result_Data["word_count"],
                    Probabilities=Probs
                )
                Results.append(Result)

            Batch_Result = Batch_Classification_Result(
                Count=len(Results),
                Results=Results
            )

            return Classify_Batch_Mutation(Success=True, Result=Batch_Result)

        except Exception as E:
            Logger.error(f"Batch classification error: {str(E)}")
            return Classify_Batch_Mutation(
                Success=False,
                Error=f"An error occurred during batch classification: {str(E)}"
            )


class Query(ObjectType):
    Model_Info = Field(Model_Info_Type)
    Health_Check = Field(Boolean)
    Get_User_Classifications = List(
        Classification_Level_Type,
        User_Id=String(required=True),
        Limit=Int(default_value=10),
        Offset=Int(default_value=0)
    )
    Get_Classification_By_Level = List(
        Classification_Level_Type,
        User_Id=String(required=True),
        Level=String(required=True)
    )
    Get_Recent_Classifications = List(
        Classification_Level_Type,
        User_Id=String(required=True),
        Days=Int(default_value=7)
    )

    def resolve_Model_Info(self, info):
        try:
            Classifier = Get_Classifier()
            Info_Data = Classifier.Get_Model_Info()

            return Model_Info_Type(
                Model_Path=Info_Data["model_path"],
                Device=Info_Data["device"],
                Model_Type=Info_Data["model_type"],
                Num_Labels=Info_Data["num_labels"],
                Levels=Info_Data["levels"],
                GPU_Available=Info_Data["gpu_available"],
                Model_Loaded=Info_Data["model_loaded"]
            )
        except Exception as E:
            Logger.error(f"Error getting model info: {str(E)}")
            return None

    def resolve_Health_Check(self, info):
        try:
            Classifier = Get_Classifier()
            return Classifier.Model is not None
        except Exception:
            return False

    @require_auth
    def resolve_Get_User_Classifications(self, info, User_Id, Limit=10, Offset=0):
        try:
            Classifications = Classification_Level.objects.filter(
                User_Id=User_Id
            ).order_by('-Created_At')[Offset:Offset + Limit]
            return [Convert_Classification_To_Type(C) for C in Classifications]
        except Exception as E:
            Logger.error(f"Error getting user classifications: {str(E)}")
            return []

    @require_auth
    def resolve_Get_Classification_By_Level(self, info, User_Id, Level):
        try:
            Classifications = Classification_Level.objects.filter(
                User_Id=User_Id,
                Level=Level
            ).order_by('-Created_At')
            return [Convert_Classification_To_Type(C) for C in Classifications]
        except Exception as E:
            Logger.error(f"Error getting classifications by level: {str(E)}")
            return []

    @require_auth
    def resolve_Get_Recent_Classifications(self, info, User_Id, Days=7):
        try:
            Since_Date = timezone.now() - timedelta(days=Days)
            Classifications = Classification_Level.objects.filter(
                User_Id=User_Id,
                Created_At__gte=Since_Date
            ).order_by('-Created_At')
            return [Convert_Classification_To_Type(C) for C in Classifications]
        except Exception as E:
            Logger.error(f"Error getting recent classifications: {str(E)}")
            return []


class Mutation(ObjectType):
    Classify_Text = Classify_Text_Mutation.Field()
    Classify_Batch = Classify_Batch_Mutation.Field()


Schema = graphene.Schema(query=Query, mutation=Mutation)