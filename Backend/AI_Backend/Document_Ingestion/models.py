import uuid

from djongo import models


def generate_analysis_id():
	return str(uuid.uuid4())


class Document_Analysis(models.Model):
	STATUS_CHOICES = [
		('COMPLETED', 'Completed'),
		('FAILED', 'Failed'),
	]

	_id = models.ObjectIdField()
	Analysis_Id = models.CharField(max_length=36, unique=True, db_index=True, default=generate_analysis_id)
	User_Id = models.CharField(max_length=100, db_index=True, blank=True, default='')

	Pdf_Url = models.CharField(max_length=1000, blank=True, default='')
	Pdf_Storage_Path = models.CharField(max_length=1000, blank=True, default='')
	File_Name = models.CharField(max_length=255, blank=True, default='')
	Page_Count = models.IntegerField(default=0)
	Extraction_Tool = models.CharField(max_length=100, blank=True, default='')

	Page_Results = models.JSONField(default=list, blank=True)
	Clean_Text = models.TextField(blank=True, default='')

	Classification_Level = models.CharField(max_length=10, blank=True, default='')
	Classification_Confidence = models.FloatField(default=0.0)
	Classification_Description = models.TextField(blank=True, default='')
	Classification_Probabilities = models.JSONField(default=dict, blank=True)

	Feedback_Corrected_Text = models.TextField(blank=True, default='')
	Feedback_Overall_Score = models.FloatField(default=0.0)
	Feedback_Grammar_Score = models.FloatField(default=0.0)
	Feedback_Vocab_Score = models.FloatField(default=0.0)
	Feedback_Punct_Score = models.FloatField(default=0.0)
	Feedback_Detected_Issues = models.JSONField(default=list, blank=True)
	Feedback_Errors          = models.JSONField(default=list, blank=True)
	Feedback_Error_Trend     = models.CharField(max_length=20, blank=True, default='')
	Feedback_Dominant_Error  = models.CharField(max_length=30, blank=True, default='')
	Feedback_Severity        = models.FloatField(default=0.0)
	Feedback_Fluency         = models.FloatField(default=0.0)
	Feedback_Text            = models.TextField(blank=True, default='')

	Status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='COMPLETED', db_index=True)
	Error_Message = models.TextField(blank=True, default='')

	Created_At = models.DateTimeField(auto_now_add=True, db_index=True)
	Updated_At = models.DateTimeField(auto_now=True)

	class Meta:
		db_table = 'document_analyses'
		ordering = ['-Created_At']
		indexes = [
			models.Index(fields=['User_Id', '-Created_At']),
			models.Index(fields=['Analysis_Id']),
		]

	def __str__(self):
		return f'{self.Analysis_Id} - {self.File_Name}'
