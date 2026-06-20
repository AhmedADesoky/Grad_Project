import logging
from django.apps import AppConfig

Logger = logging.getLogger(__name__)


class ChatbotConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'Chatbot'

    def ready(self):
        """
        Pre-load the SentenceTransformer embedding model when Django starts.
        This eliminates the cold-start delay on the first chat request.
        Runs in a background thread so it does not block server startup.
        """
        import threading

        def _preload():
            try:
                from Personalized_Plan.services.Plan_Generator import _get_embed_model
                model = _get_embed_model()
                Logger.info("Chatbot: embedding model pre-loaded (%s)", type(model).__name__)
            except Exception as e:
                Logger.warning("Chatbot: embedding model pre-load failed — %s", e)

        t = threading.Thread(target=_preload, daemon=True, name="chatbot-embed-preload")
        t.start()
