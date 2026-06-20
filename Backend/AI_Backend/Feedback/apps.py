from django.apps import AppConfig
import logging

Logger = logging.getLogger(__name__)


class FeedbackConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'Feedback'

    def ready(self):
        try:
            from .services.Feedback_Model import Get_Feedback_Analyzer
            Get_Feedback_Analyzer()
            Logger.info("Feedback_Analyzer preloaded successfully")
        except Exception as exc:
            Logger.warning("Feedback_Analyzer preload failed: %s", exc)
