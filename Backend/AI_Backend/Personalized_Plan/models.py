from django.db import models
from django.utils import timezone


class Personalized_Plan(models.Model):
    _id = models.CharField(max_length=24, blank=True, default="")
    User_Id = models.CharField(max_length=100, db_index=True)
    Mode = models.CharField(max_length=16, choices=[("weekly", "weekly"), ("monthly", "monthly")])
    Level = models.CharField(max_length=2)
    Focus_Skills = models.JSONField(default=list, blank=True)
    Plan = models.JSONField()
    Is_Active = models.BooleanField(default=True, db_index=True)
    Starts_At = models.DateTimeField(default=timezone.now)
    Ends_At = models.DateTimeField(null=True, blank=True)
    Current_Period_Index = models.IntegerField(default=0)
    Completed_At = models.DateTimeField(null=True, blank=True)
    Source_Exam_Id = models.CharField(max_length=100, blank=True, default='')
    Source_Exam_Issues = models.JSONField(default=list, blank=True)
    Created_At = models.DateTimeField(default=timezone.now, db_index=True)
    Updated_At = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "personalized_plans"
        ordering = ["-Created_At"]
        indexes = [
            models.Index(fields=["User_Id", "-Created_At"]),
            models.Index(fields=["User_Id", "Mode", "-Created_At"]),
            models.Index(fields=["Is_Active", "User_Id", "Mode"]),
            models.Index(fields=["Level"]),
        ]

    def save(self, *args, **kwargs):
        self.Updated_At = timezone.now()
        # djongo rejects None for JSONFields — ensure they are always list/dict
        if self.Focus_Skills is None:
            self.Focus_Skills = []
        if self.Source_Exam_Issues is None:
            self.Source_Exam_Issues = []
        if self.Plan is None:
            self.Plan = {}
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.User_Id} - {self.Level} - {self.Mode}"


class Task_Details(models.Model):
    _id = models.CharField(max_length=24, blank=True, default="")
    User_Id = models.CharField(max_length=100, db_index=True)
    Plan_Id = models.CharField(max_length=100, db_index=True)
    Task_Id = models.CharField(max_length=200, db_index=True)

    Mode = models.CharField(max_length=16)
    Level = models.CharField(max_length=2)
    Period = models.CharField(max_length=32, blank=True)
    Day = models.CharField(max_length=16, blank=True)

    Title = models.CharField(max_length=256, blank=True)
    Type = models.CharField(max_length=64, blank=True)

    Status = models.CharField(
        max_length=16,
        choices=[
            ("todo", "todo"),
            ("in_progress", "in_progress"),
            ("submitted", "submitted"),
            ("reviewed", "reviewed"),
            ("cancelled", "cancelled"),
        ],
        default="todo",
    )

    # Task card learn-phase fields (populated when task is created from plan)
    Explanation = models.TextField(blank=True)
    Example_Error = models.TextField(blank=True)
    Example_Correction = models.TextField(blank=True)
    Correction_Reason = models.TextField(blank=True)

    Input_Text = models.TextField(blank=True)
    Corrected_Text = models.TextField(blank=True)
    Detected_Issues = models.JSONField(default=list, blank=True)
    Scores = models.JSONField(default=dict, blank=True)
    Feedback_Errors = models.JSONField(default=list, blank=True)
    Feedback_Error_Trend = models.CharField(max_length=20, blank=True, default='')
    Feedback_Dominant_Error = models.CharField(max_length=30, blank=True, default='')
    Materials_Used = models.JSONField(default=list, blank=True)
    Material_Quality = models.FloatField(default=0)

    Started_At = models.DateTimeField(null=True, blank=True)
    Ends_At = models.DateTimeField(null=True, blank=True)
    Submitted_At = models.DateTimeField(null=True, blank=True)
    Is_Auto_Submitted = models.BooleanField(default=False)

    Created_At = models.DateTimeField(default=timezone.now, db_index=True)
    Updated_At = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "task_details"
        ordering = ["-Created_At"]
        indexes = [
            models.Index(fields=["User_Id", "-Created_At"]),
            models.Index(fields=["User_Id", "Plan_Id"]),
            models.Index(fields=["Plan_Id", "Task_Id"]),
        ]

    def save(self, *args, **kwargs):
        self.Updated_At = timezone.now()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.User_Id} - {self.Task_Id} - {self.Status}"