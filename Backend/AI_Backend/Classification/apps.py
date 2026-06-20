from django.apps import AppConfig
import logging

Logger = logging.getLogger(__name__)


class ClassificationConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'Classification'

    def ready(self):
        try:
            from .services.DistilBERT_Classifier import Get_Classifier
            Get_Classifier()
            Logger.info("CEFR_Classifier preloaded successfully")
        except Exception as exc:
            Logger.warning("CEFR_Classifier preload failed: %s", exc)
