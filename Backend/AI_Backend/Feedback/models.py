from djongo import models
from django.utils import timezone


class Feedback_Result(models.Model):

    _id = models.ObjectIdField()
    User_Id = models.CharField(max_length=100, db_index=True)
    Text = models.TextField()
    Corrected = models.TextField()

    Overall_Score = models.FloatField()
    Grammar_Score = models.FloatField()
    Vocab_Score = models.FloatField()
    Punct_Score = models.FloatField()

    Detected_Issues = models.JSONField(null=True, blank=True)
    Created_At = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'feedback_results'
        ordering = ['-Created_At']
        indexes = [
            models.Index(fields=['User_Id', '-Created_At']),
        ]

    def __str__(self):
        return f"{self.User_Id} - {self.Overall_Score:.2f}"
