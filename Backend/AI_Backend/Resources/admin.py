from django.contrib import admin
from .models import Resource, User_Resource_Interaction


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display  = ('Title', 'Type', 'Source', 'Is_Active', 'Clicks', 'Updated_At')
    list_filter   = ('Type', 'Is_Active')
    search_fields = ('Title', 'Source', 'Description')
    ordering      = ('-Clicks', 'Title')
    list_editable = ('Is_Active',)
    fieldsets = (
        (None, {
            'fields': ('Title', 'Url', 'Description', 'Type', 'Source', 'Is_Active')
        }),
        ('Targeting', {
            'fields': ('Categories', 'Tags', 'Cefr_Levels'),
            'description': (
                'Categories: ["grammar","punctuation","vocabulary","writing_style"] — '
                'Tags: detected_issue keywords — '
                'Cefr_Levels: ["A1","A2","B1","B2","C1","C2"]'
            ),
        }),
        ('Stats', {
            'fields': ('Clicks',),
        }),
    )


@admin.register(User_Resource_Interaction)
class UserResourceInteractionAdmin(admin.ModelAdmin):
    list_display = ('User_Id', 'Resource_Id', 'Clicked', 'Seen_At', 'Clicked_At')
    list_filter  = ('Clicked',)
    search_fields = ('User_Id', 'Resource_Id')
    ordering     = ('-Seen_At',)
