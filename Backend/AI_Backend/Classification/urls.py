from django.urls import path
from graphene_django.views import GraphQLView
from .schema import Schema

urlpatterns = [
    path('graphql/', GraphQLView.as_view(graphiql=True, schema=Schema)),
]
