"""Invoice storage service — saves invoice images locally and serves them via the app.

Google Drive service accounts on personal accounts can't upload files (no storage quota).
Instead, we store files locally in uploads/{site_id}/ and serve them via FastAPI.
If you have Google Workspace with Shared Drives, you can switch to Drive upload.
"""
from __future__ import annotations

import logging
import shutil
from pathlib import Path

from app.config import UPLOAD_DIR

logger = logging.getLogger(__name__)


def upload_invoice(file_path: Path, filename: str, site_id: str, entry_id: str) -> str:
    """Save an invoice image locally and return the URL to view it."""
    site_dir = UPLOAD_DIR / site_id
    site_dir.mkdir(parents=True, exist_ok=True)

    safe_name = f"{entry_id}_{filename}".replace("/", "_").replace("\\", "_")
    dest = site_dir / safe_name
    shutil.copy2(str(file_path), str(dest))

    url = f"/api/invoices/file/{site_id}/{safe_name}"
    logger.info("Saved invoice %s → %s", filename, dest)
    return url


def list_invoices(site_id: str, entry_id: str | None = None) -> list[dict]:
    """List invoice files for a site."""
    site_dir = UPLOAD_DIR / site_id
    if not site_dir.exists():
        return []

    files = []
    for f in sorted(site_dir.iterdir(), reverse=True):
        if not f.is_file():
            continue
        if entry_id and not f.name.startswith(entry_id):
            continue
        files.append({
            "name": f.name,
            "url": f"/api/invoices/file/{site_id}/{f.name}",
            "size": f.stat().st_size,
        })
    return files
