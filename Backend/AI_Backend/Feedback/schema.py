import graphene
from graphene import ObjectType, String, Float, Int, Boolean, List, Field, Mutation
from datetime import datetime, timedelta
import logging

from .models import Feedback_Result
from .services.Feedback_Model import Get_Feedback_Analyzer
from middleware.auth import require_auth

Logger = logging.getLogger(__name__)


def Convert_Feedback_To_Type(Feedback):
    return Feedback_Result_Type(
        Id=str(Feedback._id),
        User_Id=Feedback.User_Id,
        Text=Feedback.Text,
        Corrected=Feedback.Corrected,
        Overall_Score=Feedback.Overall_Score,
        Grammar_Score=Feedback.Grammar_Score,
        Vocab_Score=Feedback.Vocab_Score,
        Punct_Score=Feedback.Punct_Score,
        Detected_Issues=Feedback.Detected_Issues,
        Created_At=str(Feedback.Created_At)
    )


class Feedback_Analysis_Type(ObjectType):
    Text = String()
    Corrected = String()
    Overall_Score = Float()
    Grammar_Score = Float()
    Vocab_Score = Float()
    Punct_Score = Float()
    Detected_Issues = List(String)


class Batch_Feedback_Analysis_Type(ObjectType):
    Count = Int()
    Results = List(Feedback_Analysis_Type)


class Feedback_Model_Info_Type(ObjectType):
    Model_Path = String()
    Device = String()
    Model_Type = String()
    Weights = graphene.JSONString()
    T5_Available = Boolean()
    Model_Loaded = Boolean()


class Feedback_Result_Type(ObjectType):
    Id = String()
    User_Id = String()
    Text = String()
    Corrected = String()
    Overall_Score = Float()
    Grammar_Score = Float()
    Vocab_Score = Float()
    Punct_Score = Float()
    Detected_Issues = graphene.JSONString()
    Created_At = String()


class Analyze_Feedback_Mutation(Mutation):
    class Arguments:
        Text = String(required=True)
        User_Id = String(required=False)
        Save_To_Database = Boolean(default_value=False)

    Success = Boolean()
    Result = Field(Feedback_Analysis_Type)
    Saved_Feedback = Field(Feedback_Result_Type)
    Error = String()

    @require_auth
    def mutate(self, info, Text, User_Id=None, Save_To_Database=False):
        try:
            if not Text or not Text.strip():
                return Analyze_Feedback_Mutation(
                    Success=False,
                    Error="Text field is required and cannot be empty"
                )

            Analyzer = Get_Feedback_Analyzer()
            Result_Data = Analyzer.Analyze_Text(Text=Text)

            Result = Feedback_Analysis_Type(
                Text=Result_Data["text"],
                Corrected=Result_Data["corrected"],
                Overall_Score=Result_Data["overall_score"],
                Grammar_Score=Result_Data["grammar_score"],
                Vocab_Score=Result_Data["vocab_score"],
                Punct_Score=Result_Data["punct_score"],
                Detected_Issues=Result_Data["detected_issues"]
            )

            Saved = None
            if Save_To_Database and User_Id:
                Saved_Model = Feedback_Result.objects.create(
                    User_Id=User_Id,
                    Text=Result_Data["text"],
                    Corrected=Result_Data["corrected"],
                    Overall_Score=Result_Data["overall_score"],
                    Grammar_Score=Result_Data["grammar_score"],
                    Vocab_Score=Result_Data["vocab_score"],
                    Punct_Score=Result_Data["punct_score"],
                    Detected_Issues=Result_Data["detected_issues"]
                )
                Saved = Convert_Feedback_To_Type(Saved_Model)

            return Analyze_Feedback_Mutation(
                Success=True,
                Result=Result,
                Saved_Feedback=Saved
            )
        except ValueError as E:
            Logger.error(f"Validation error: {str(E)}")
            return Analyze_Feedback_Mutation(Success=False, Error=str(E))
        except Exception as E:
            Logger.error(f"Feedback analysis error: {str(E)}")
            return Analyze_Feedback_Mutation(
                Success=False,
                Error=f"An error occurred during feedback analysis: {str(E)}"
            )


class Analyze_Feedback_Batch_Mutation(Mutation):
    class Arguments:
        Texts = List(String, required=True)

    Success = Boolean()
    Result = Field(Batch_Feedback_Analysis_Type)
    Error = String()

    def mutate(self, info, Texts):
        try:
            if not Texts or not isinstance(Texts, list):
                return Analyze_Feedback_Batch_Mutation(
                    Success=False,
                    Error="Texts field is required and must be a list"
                )

            if len(Texts) == 0:
                return Analyze_Feedback_Batch_Mutation(
                    Success=False,
                    Error="Texts list cannot be empty"
                )

            if len(Texts) > 50:
                return Analyze_Feedback_Batch_Mutation(
                    Success=False,
                    Error="Maximum 50 texts allowed per request"
                )

            Analyzer = Get_Feedback_Analyzer()
            Results_Data = Analyzer.Analyze_Batch(Texts)

            Results = []
            for Item in Results_Data:
                if "error" in Item:
                    continue

                Results.append(
                    Feedback_Analysis_Type(
                        Text=Item["text"],
                        Corrected=Item["corrected"],
                        Overall_Score=Item["overall_score"],
                        Grammar_Score=Item["grammar_score"],
                        Vocab_Score=Item["vocab_score"],
                        Punct_Score=Item["punct_score"],
                        Detected_Issues=Item["detected_issues"]
                    )
                )

            return Analyze_Feedback_Batch_Mutation(
                Success=True,
                Result=Batch_Feedback_Analysis_Type(
                    Count=len(Results),
                    Results=Results
                )
            )
        except Exception as E:
            Logger.error(f"Batch feedback analysis error: {str(E)}")
            return Analyze_Feedback_Batch_Mutation(
                Success=False,
                Error=f"An error occurred during batch feedback analysis: {str(E)}"
            )


class Query(ObjectType):
    Feedback_Model_Info = Field(Feedback_Model_Info_Type)
    Feedback_Health_Check = Field(Boolean)

    Get_User_Feedback = List(
        Feedback_Result_Type,
        User_Id=String(required=True),
        Limit=Int(default_value=10),
        Offset=Int(default_value=0)
    )

    Get_Recent_Feedback = List(
        Feedback_Result_Type,
        User_Id=String(required=True),
        Days=Int(default_value=7)
    )

    def resolve_Feedback_Model_Info(self, info):
        try:
            Analyzer = Get_Feedback_Analyzer()
            Info_Data = Analyzer.Get_Model_Info()
            return Feedback_Model_Info_Type(
                Model_Path=Info_Data["model_path"],
                Device=Info_Data["device"],
                Model_Type=Info_Data["model_type"],
                Weights=Info_Data["weights"],
                T5_Available=Info_Data["t5_available"],
                Model_Loaded=Info_Data["model_loaded"]
            )
        except Exception as E:
            Logger.error(f"Error getting feedback model info: {str(E)}")
            return None

    def resolve_Feedback_Health_Check(self, info):
        try:
            Analyzer = Get_Feedback_Analyzer()
            return Analyzer.Model is not None and Analyzer.Tokenizer is not None
        except Exception:
            return False

    @require_auth
    def resolve_Get_User_Feedback(self, info, User_Id, Limit=10, Offset=0):
        try:
            Items = Feedback_Result.objects.filter(
                User_Id=User_Id
            ).order_by('-Created_At')[Offset:Offset + Limit]
            return [Convert_Feedback_To_Type(Item) for Item in Items]
        except Exception as E:
            Logger.error(f"Error getting user feedback: {str(E)}")
            return []

    @require_auth
    def resolve_Get_Recent_Feedback(self, info, User_Id, Days=7):
        try:
            Start_Date = datetime.now() - timedelta(days=Days)
            Items = Feedback_Result.objects.filter(
                User_Id=User_Id,
                Created_At__gte=Start_Date
            ).order_by('-Created_At')
            return [Convert_Feedback_To_Type(Item) for Item in Items]
        except Exception as E:
            Logger.error(f"Error getting recent feedback: {str(E)}")
            return []


class Mutation(ObjectType):
    Analyze_Feedback = Analyze_Feedback_Mutation.Field()
    Analyze_Feedback_Batch = Analyze_Feedback_Batch_Mutation.Field()
