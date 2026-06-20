from djongo import models
from django.utils import timezone
import uuid


def generate_attempt_id():
    return str(uuid.uuid4())


class Exam_Attempt(models.Model):
    STATUS_CHOICES = [
        ("IN_PROGRESS", "In Progress"),
        ("SUBMITTED", "Submitted"),
        ("AUTO_SUBMITTED", "Auto Submitted"),
        ("EXPIRED", "Expired"),
    ]

    _id = models.ObjectIdField()
    Attempt_Id = models.CharField(
        max_length=36,
        unique=True,
        db_index=True,
        default=generate_attempt_id,
    )
    User_Id = models.CharField(max_length=100, db_index=True)
    Level = models.CharField(max_length=2, default="A1")

    Duration_Minutes = models.IntegerField(default=45)
    Started_At = models.DateTimeField(default=timezone.now, db_index=True)
    Expires_At = models.DateTimeField(db_index=True)
    Submitted_At = models.DateTimeField(null=True, blank=True, db_index=True)

    Status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="IN_PROGRESS", db_index=True)
    Auto_Submitted = models.BooleanField(default=False)

    Questions = models.JSONField(default=list, blank=True)
    Answers = models.JSONField(default=list, blank=True)
    Question_Results = models.JSONField(default=list, blank=True)

    Total_Points = models.FloatField(default=0.0)
    Total_Score = models.FloatField(default=0.0)
    Percentage = models.FloatField(default=0.0)
    Passed = models.BooleanField(default=False)

    Final_Level = models.CharField(max_length=2, default="A1")
    Final_Confidence = models.FloatField(default=0.0)

    AI_Detected = models.BooleanField(default=False)
    AI_Confidence = models.FloatField(default=0.0)

    Created_At = models.DateTimeField(default=timezone.now, db_index=True)
    Updated_At = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "exam_attempts"
        ordering = ["-Created_At"]
        indexes = [
            models.Index(fields=["User_Id", "-Created_At"]),
            models.Index(fields=["User_Id", "Status"]),
            models.Index(fields=["-Expires_At"]),
        ]

    def __str__(self):
        return f"{self.User_Id} - {self.Attempt_Id} - {self.Status}"