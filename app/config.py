"""Application configuration loaded from environment variables."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Central configuration — values come from .env or OS environment."""

    # Google APIs
    google_credentials_path: str = "credentials.json"
    google_credentials_json: str = ""  # JSON string of credentials (for cloud deploy)
    spreadsheet_id: str = ""
    gdrive_folder_id: str = ""

    # App
    app_title: str = "Welkin Builders Infrastructure Ltd - Cash Tracker"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    secret_key: str = "change-this-to-a-random-secret-key"
    access_token_expire_minutes: int = 1440  # 24 hours

    # Default admin
    admin_mobile: str = "9999999999"
    admin_name: str = "Owner"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# If credentials JSON is provided as env var (cloud deployment),
# write it to a temp file so gspread can read it
if settings.google_credentials_json and not Path(settings.google_credentials_path).exists():
    _creds_path = Path(tempfile.gettempdir()) / "gcp_credentials.json"
    _creds_path.write_text(settings.google_credentials_json)
    settings.google_credentials_path = str(_creds_path)

# Use PORT env var if set (Railway, Heroku, etc.)
if os.environ.get("PORT"):
    settings.app_port = int(os.environ["PORT"])

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
