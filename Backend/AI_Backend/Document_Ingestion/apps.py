from django.apps import AppConfig


class DocumentIngestionConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'Document_Ingestion'

    def ready(self):
        # Pre-load TrOCR once at startup so the first request isn't slow.
        try:
            from .services.TrOCR_Engine import is_available, get_trocr_engine
            if is_available():
                get_trocr_engine()
        except Exception:
            pass
