import graphene
from graphene import ObjectType, String, Int, Boolean, List, Field, Mutation
import logging

Logger = logging.getLogger(__name__)


class Resource_Type(ObjectType):
    Title       = String()
    Url         = String()
    Description = String()
    Source      = String()
    Skill       = String()
    Cefr_Level  = String()


class Get_Recommendations_Result(ObjectType):
    Success   = Boolean()
    Resources = List(Resource_Type)
    Error     = String()


class Track_Click_Mutation(Mutation):
    class Arguments:
        User_Id      = String(required=True)
        Resource_Url = String(required=True)

    Success = Boolean()
    Error   = String()

    def mutate(self, info, User_Id, Resource_Url):
        try:
            from .services.Recommender import track_click
            track_click(user_id=User_Id, resource_url=Resource_Url)
            return Track_Click_Mutation(Success=True)
        except Exception as e:
            Logger.error("Track_Click error: %s", e)
            return Track_Click_Mutation(Success=False, Error=str(e))


class Query(ObjectType):
    Get_Recommendations = Field(
        Get_Recommendations_Result,
        Issues     = List(String, required=True),
        Cefr_Level = String(required=True),
        User_Id    = String(required=False),
        Limit      = Int(default_value=3),
    )

    Resources_Health = Boolean()

    def resolve_Get_Recommendations(self, info, Issues, Cefr_Level, User_Id=None, Limit=3):
        try:
            from .services.Recommender import get_recommendations
            items = get_recommendations(
                issues=Issues,
                cefr_level=Cefr_Level,
                user_id=User_Id,
                limit=max(1, min(Limit, 10)),
            )
            resources = [
                Resource_Type(
                    Title=r["title"],
                    Url=r["url"],
                    Description=r["description"],
                    Source=r["source"],
                    Skill=r["skill"],
                    Cefr_Level=r["cefr_level"],
                )
                for r in items
            ]
            return Get_Recommendations_Result(Success=True, Resources=resources)
        except Exception as e:
            Logger.error("Get_Recommendations error: %s", e)
            return Get_Recommendations_Result(Success=False, Resources=[], Error=str(e))

    def resolve_Resources_Health(self, info):
        try:
            from .services.Recommender import _vector_search
            return True
        except Exception:
            return False


class Mutation(ObjectType):
    Track_Resource_Click = Track_Click_Mutation.Field()
