from django.contrib import admin
from .models import Classification_Level

@admin.register(Classification_Level)
class Classification_Level_Admin(admin.ModelAdmin):
    list_display = ['User_Id', 'Level', 'Confidence', 'Created_At']
    list_filter = ['Level', 'Created_At']
    search_fields = ['User_Id', 'Text']
    readonly_fields = ['Created_At']
    ordering = ['-Created_At']
