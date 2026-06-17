from django.db import models
from django.utils import timezone

class Classification_Level(models.Model):

    _id = models.CharField(max_length=24, blank=True, default="")
    User_Id = models.CharField(max_length=100, db_index=True)
    Text = models.TextField()

    Level = models.CharField(max_length=2, choices=[
        ('A1', 'A1 - Beginner'),
        ('A2', 'A2 - Elementary'),
        ('B1', 'B1 - Intermediate'),
        ('B2', 'B2 - Upper Intermediate'),
        ('C1', 'C1 - Advanced'),
        ('C2', 'C2 - Proficient'),
    ])

    Confidence = models.FloatField()
    Description = models.TextField()
    Text_Length = models.IntegerField()
    Word_Count = models.IntegerField()
    Probabilities = models.JSONField(null=True, blank=True)
    Created_At = models.DateTimeField(default=timezone.now, db_index=True)
    
    class Meta:
        
        db_table = 'classification_levels'
        ordering = ['-Created_At']
        indexes = [
            models.Index(fields=['User_Id', '-Created_At']),
            models.Index(fields=['Level']),
        ]
    
    def __str__(self):
        return f"{self.User_Id} - {self.Level} ({self.Confidence:.2f}%)"
