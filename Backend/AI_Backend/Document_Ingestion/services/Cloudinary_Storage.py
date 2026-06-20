import logging
import os
from pathlib import Path

Logger = logging.getLogger(__name__)

_configured = False


def _configure():
    global _configured
    if _configured:
        return
    try:
        import cloudinary
        cloudinary.config(
            cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
            api_key=os.getenv("CLOUDINARY_API_KEY"),
            api_secret=os.getenv("CLOUDINARY_API_SECRET"),
            secure=True,
        )
        _configured = True
    except Exception as exc:
        Logger.warning("Cloudinary config failed: %s", exc)


def upload_pdf(local_path: Path, file_name: str) -> str | None:
    """
    Upload a PDF file to Cloudinary and return the secure URL.
    Returns None if Cloudinary is not configured or upload fails.
    Both digital and scanned PDFs are supported — we upload the raw file.
    """
    _configure()
    if not _configured:
        return None

    try:
        import cloudinary.uploader

        # Strip .pdf extension — Cloudinary adds it back via format param
        public_id = Path(file_name).stem.replace(" ", "_")

        result = cloudinary.uploader.upload(
            str(local_path),
            resource_type="raw",        # required for non-image files (PDFs)
            folder="ewc/pdfs",
            public_id=public_id,
            overwrite=False,            # keep both if same name uploaded twice
            unique_filename=True,
            format="pdf",
        )
        url = result.get("secure_url")
        Logger.info("PDF uploaded to Cloudinary: %s", url)
        return url
    except Exception as exc:
        Logger.warning("Cloudinary upload failed, using local path: %s", exc)
        return None
