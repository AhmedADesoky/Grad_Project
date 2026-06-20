from djongo import models
from django.utils import timezone


CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
RESOURCE_TYPES = ["video", "article", "exercise", "book", "website"]


class Resource(models.Model):
    _id = models.ObjectIdField()

    Title       = models.CharField(max_length=256)
    Url         = models.URLField(max_length=512)
    Description = models.TextField(blank=True)
    Type        = models.CharField(
        max_length=16,
        choices=[(t, t) for t in RESOURCE_TYPES],
        default="article",
    )
    Source      = models.CharField(max_length=128, blank=True)  # e.g. "BBC Learning English"

    # Skill categories this resource covers (e.g. ["grammar", "punctuation"])
    Categories  = models.JSONField(default=list)

    # Issue keywords this resource addresses (e.g. ["comma splice", "run-on"])
    Tags        = models.JSONField(default=list)

    # CEFR levels this resource suits (e.g. ["A2", "B1", "B2"])
    Cefr_Levels = models.JSONField(default=list)

    # Engagement counters
    Clicks      = models.IntegerField(default=0)

    Is_Active   = models.BooleanField(default=True)
    Created_At  = models.DateTimeField(default=timezone.now)
    Updated_At  = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "resources"
        ordering = ["-Clicks", "Title"]

    def save(self, *args, **kwargs):
        self.Updated_At = timezone.now()
        if self.Categories is None:
            self.Categories = []
        if self.Tags is None:
            self.Tags = []
        if self.Cefr_Levels is None:
            self.Cefr_Levels = []
        super().save(*args, **kwargs)

    def __str__(self):
        return f"[{self.Type}] {self.Title}"


class User_Resource_Interaction(models.Model):
    """Tracks which resources a user has already seen or clicked."""
    _id         = models.ObjectIdField()
    User_Id     = models.CharField(max_length=100, db_index=True)
    Resource_Id = models.CharField(max_length=100, db_index=True)
    Clicked     = models.BooleanField(default=False)
    Seen_At     = models.DateTimeField(default=timezone.now)
    Clicked_At  = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "user_resource_interactions"
        ordering = ["-Seen_At"]
        indexes = [
            models.Index(fields=["User_Id", "Resource_Id"]),
            models.Index(fields=["User_Id", "-Seen_At"]),
        ]

    def __str__(self):
        return f"{self.User_Id} → {self.Resource_Id}"
