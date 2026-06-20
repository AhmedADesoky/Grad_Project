from django.db import migrations, models
import djongo.models.fields


class Migration(migrations.Migration):

    dependencies = [
        ('Personalized_Plan', '0003_task_details_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='personalized_plan',
            name='Source_Exam_Id',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='personalized_plan',
            name='Source_Exam_Issues',
            field=djongo.models.fields.JSONField(blank=True, default=list),
        ),
    ]
