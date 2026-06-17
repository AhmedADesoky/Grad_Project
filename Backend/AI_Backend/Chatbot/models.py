import uuid
from django.db import models
from django.utils import timezone


class ChatSession(models.Model):
    _id = models.CharField(max_length=24, blank=True, default="")
    Session_Id     = models.CharField(max_length=36, unique=True, db_index=True)
    User_Id        = models.CharField(max_length=100, db_index=True)
    Title          = models.CharField(max_length=200, default='New conversation')
    Pdf_Url        = models.CharField(max_length=1000, blank=True, default='')
    Pdf_Filename   = models.CharField(max_length=500,  blank=True, default='')
    Pdf_Text       = models.TextField(blank=True, default='')
    Chunks         = models.JSONField(default=list, blank=True)   # list of {chunk_id, text, embedding}
    Message_Count  = models.IntegerField(default=0)
    Created_At     = models.DateTimeField(default=timezone.now, db_index=True)
    Updated_At     = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'chat_sessions'
        ordering = ['-Updated_At']
        indexes  = [models.Index(fields=['User_Id', '-Updated_At'])]

    def __str__(self):
        return f"{self.User_Id} — {self.Title}"


class ChatMessage(models.Model):
    _id = models.CharField(max_length=24, blank=True, default="")
    Message_Id     = models.CharField(max_length=36, unique=True, db_index=True)
    Session_Id     = models.CharField(max_length=36, db_index=True)
    User_Id        = models.CharField(max_length=100, db_index=True)
    Role           = models.CharField(max_length=20)           # 'user' | 'assistant'
    Content        = models.TextField()
    Intent         = models.CharField(max_length=50, blank=True, default='')
    Chunks_Used    = models.JSONField(default=list, blank=True)    # list of chunk_ids retrieved for this turn
    Rating         = models.CharField(max_length=10, blank=True, default='')   # 'good'|'bad'|''
    Rating_Comment = models.CharField(max_length=500, blank=True, default='')
    Timestamp      = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'chat_messages'
        ordering = ['Timestamp']
        indexes  = [models.Index(fields=['Session_Id', 'Timestamp'])]

    def __str__(self):
        return f"[{self.Role}] {self.Session_Id} — {self.Content[:60]}"
