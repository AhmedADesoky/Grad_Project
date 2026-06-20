import graphene
from Classification.schema import Query as Classification_Query, Mutation as Classification_Mutation
from Feedback.schema import Query as Feedback_Query, Mutation as Feedback_Mutation
from Exam.schema import Query as Exam_Query, Mutation as Exam_Mutation
from Personalized_Plan.schema import Query as Plan_Query, Mutation as Plan_Mutation
from Document_Ingestion.schema import Document_Ingestion_Query, Document_Ingestion_Mutation
from AI_Detection.schema import Query as AI_Detection_Query, Mutation as AI_Detection_Mutation
from Resources.schema import Query as Resources_Query, Mutation as Resources_Mutation
from Chatbot.schema import Query as Chatbot_Query, Mutation as Chatbot_Mutation

class Query(Classification_Query, Feedback_Query, Exam_Query, Plan_Query, Document_Ingestion_Query, AI_Detection_Query, Resources_Query, Chatbot_Query, graphene.ObjectType):
    pass


class Mutation(Classification_Mutation, Feedback_Mutation, Exam_Mutation, Plan_Mutation, Document_Ingestion_Mutation, AI_Detection_Mutation, Resources_Mutation, Chatbot_Mutation, graphene.ObjectType):
    pass


schema = graphene.Schema(query=Query, mutation=Mutation, auto_camelcase=False)