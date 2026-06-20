from django.apps import AppConfig
import logging

Logger = logging.getLogger(__name__)


class AiDetectionConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'AI_Detection'

    def ready(self):
        try:
            from .services.AI_Detector import is_available, Get_Detector
            if is_available():
                Get_Detector()
                Logger.info("AI_Detector preloaded successfully")
            else:
                Logger.warning("AI_Detector weights not found — skipping preload")
        except Exception as exc:
            Logger.warning("AI_Detector preload failed: %s", exc)
