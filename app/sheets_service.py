"""Google Sheets service — all read/write operations for the cash tracker.

Sheet layout per site (matches the original Invoice.xlsx):
  A: In No | B: Date | C: Bill No. | D: V.No | E: Name of Party
  F: Particulars / Material Detail | G: Qty | H: Unit | I: Rate
  J: Amount | K: Ref Ledger | L: Status | M: Entered By
  N: Entry ID | O: Payment Mode | P: Remarks | Q: Invoice URL
  R: Timestamp | S: Admin Remarks
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import gspread
from google.oauth2.service_account import Credentials

from app.config import settings

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

HEADER_ROW = [
    "In No", "Date", "Bill No.", "V.No", "Name of Party",
    "Particulars / Material Detail", "Qty", "Unit", "Rate",
    "Amount", "Ref Ledger", "Status", "Entered By",
    "Entry ID", "Payment Mode", "Remarks", "Invoice URL",
    "Timestamp", "Admin Remarks", "Batch ID",
]

META_SHEETS = {
    "users": "APP_Users",
    "sites": "APP_Sites",
    "notifications": "APP_Notifications",
}

# ── In-memory cache to reduce Google Sheets API calls ──────────────
_cache: dict[str, tuple[float, object]] = {}
CACHE_TTL = 15  # seconds (short TTL for faster data refresh)


def _cache_get(key: str):
    if key in _cache:
        ts, data = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
    return None


def _cache_set(key: str, data: object):
    _cache[key] = (time.time(), data)


def _cache_clear(prefix: str = ""):
    keys = [k for k in _cache if k.startswith(prefix)] if prefix else list(_cache.keys())
    for k in keys:
        del _cache[k]


# ── Google API clients (reuse connection) ──────────────────────────
_client: gspread.Client | None = None
_client_ts: float = 0


_creds_file: str | None = None


def _resolve_credentials_path() -> str:
    """Return a valid file path to the credentials JSON.
    Handles the case where the path is actually the JSON content itself."""
    global _creds_file
    if _creds_file and Path(_creds_file).exists():
        return _creds_file

    import json as _json
    import tempfile

    path = settings.google_credentials_path
    # Check if the "path" is actually JSON content
    if path.strip().startswith("{"):
        tmp = Path(tempfile.gettempdir()) / "gcp_creds.json"
        tmp.write_text(path)
        _creds_file = str(tmp)
        return _creds_file

    # Check the dedicated JSON env var
    json_str = settings.google_credentials_json or os.environ.get("GOOGLE_CREDENTIALS_JSON", "")
    if json_str.strip().startswith("{"):
        tmp = Path(tempfile.gettempdir()) / "gcp_creds.json"
        tmp.write_text(json_str)
        _creds_file = str(tmp)
        return _creds_file

    _creds_file = path
    return path


def _get_client() -> gspread.Client:
    global _client, _client_ts
    if _client and time.time() - _client_ts < 300:
        return _client
    creds_path = _resolve_credentials_path()
    creds = Credentials.from_service_account_file(creds_path, scopes=SCOPES)
    _client = gspread.authorize(creds)
    _client_ts = time.time()
    return _client


def _open_spreadsheet(spreadsheet_id: str | None = None) -> gspread.Spreadsheet:
    client = _get_client()
    sid = spreadsheet_id or settings.spreadsheet_id
    return client.open_by_key(sid)


# ── Helper: ensure a worksheet exists with the right headers ───────
def _ensure_worksheet(
    spreadsheet: gspread.Spreadsheet,
    title: str,
    headers: list[str],
) -> gspread.Worksheet:
    """Return the worksheet *title*, creating it with *headers* if missing."""
    try:
        ws = spreadsheet.worksheet(title)
    except gspread.WorksheetNotFound:
        ws = spreadsheet.add_worksheet(title=title, rows=2000, cols=len(headers) + 2)
        ws.update("A1", [headers])
        logger.info("Created worksheet %s", title)
    return ws


# ═══════════════════════════════════════════════════════════════════
#  USER management (stored in APP_Users sheet)
# ═══════════════════════════════════════════════════════════════════
USER_HEADERS = ["mobile", "name", "password_hash", "role", "site_ids", "created_at"]


def get_users_sheet() -> gspread.Worksheet:
    sp = _open_spreadsheet()
    return _ensure_worksheet(sp, META_SHEETS["users"], USER_HEADERS)


def find_user(mobile: str) -> dict | None:
    ws = get_users_sheet()
    records = ws.get_all_records()
    for r in records:
        if str(r.get("mobile")) == str(mobile):
            return r
    return None


def create_user(mobile: str, name: str, password_hash: str, role: str, site_id: str = "") -> dict:
    ws = get_users_sheet()
    now = datetime.now(timezone.utc).isoformat()
    # site_id can be comma-separated for multiple sites: "KCJ-ROAD,NH47-BRIDGE"
    row = [str(mobile), name, password_hash, role, site_id, now]
    ws.append_row(row, value_input_option="USER_ENTERED")
    logger.info("Created user %s (%s) sites=%s", mobile, role, site_id)
    return {"mobile": str(mobile), "name": name, "role": role, "site_ids": site_id, "created_at": now}


def list_users() -> list[dict]:
    ws = get_users_sheet()
    records = ws.get_all_records()
    for r in records:
        r["mobile"] = str(r.get("mobile", ""))
        # Support both old "site_id" and new "site_ids" column
        raw = str(r.get("site_ids", r.get("site_id", "")))
        r["site_ids"] = raw
        r["site_id"] = raw  # backward compat
    return records


def update_user(mobile: str, name: str | None = None, site_ids: str | None = None,
                password_hash: str | None = None) -> bool:
    """Update user fields (name, sites, password)."""
    ws = get_users_sheet()
    all_vals = ws.get_all_values()
    headers = all_vals[0]

    col_map = {h: i for i, h in enumerate(headers)}
    mobile_col = col_map.get("mobile")
    if mobile_col is None:
        return False

    for idx, row in enumerate(all_vals[1:], start=2):
        if str(row[mobile_col]) == str(mobile):
            if name is not None and "name" in col_map:
                ws.update_cell(idx, col_map["name"] + 1, name)
            if site_ids is not None:
                sc = col_map.get("site_ids", col_map.get("site_id"))
                if sc is not None:
                    ws.update_cell(idx, sc + 1, site_ids)
            if password_hash is not None and "password_hash" in col_map:
                ws.update_cell(idx, col_map["password_hash"] + 1, password_hash)
            logger.info("Updated user %s", mobile)
            return True
    return False


def update_user_sites(mobile: str, site_ids: str) -> bool:
    return update_user(mobile, site_ids=site_ids)


def user_has_site_access(user: dict, site_id: str) -> bool:
    """Check if a user has access to a specific site."""
    if user.get("role") in ("admin", "Role.admin"):
        return True
    raw = str(user.get("site_ids", user.get("site_id", "")))
    if not raw:
        return False
    user_sites = [s.strip() for s in raw.split(",") if s.strip()]
    return site_id in user_sites


# ═══════════════════════════════════════════════════════════════════
#  SITE management (stored in APP_Sites sheet)
# ═══════════════════════════════════════════════════════════════════
SITE_HEADERS = ["site_id", "name", "location", "spreadsheet_id", "sheet_name", "created_by", "created_at"]


def get_sites_sheet() -> gspread.Worksheet:
    sp = _open_spreadsheet()
    return _ensure_worksheet(sp, META_SHEETS["sites"], SITE_HEADERS)


def create_site(site_id: str, name: str, location: str, spreadsheet_id: str,
                sheet_name: str, created_by: str) -> dict:
    ws = get_sites_sheet()
    now = datetime.now(timezone.utc).isoformat()
    # Sheet name = site_id (always)
    actual_sheet = site_id
    row = [site_id, name, location, spreadsheet_id or settings.spreadsheet_id, actual_sheet, created_by, now]
    ws.append_row(row, value_input_option="RAW")

    # Create the data worksheet with site_id as tab name
    target_sp = _open_spreadsheet(spreadsheet_id or settings.spreadsheet_id)
    new_ws = _ensure_worksheet(target_sp, actual_sheet, HEADER_ROW)
    logger.info("Created site %s → sheet tab '%s' (rows=%d)", site_id, actual_sheet, new_ws.row_count)

    # Clear sites cache
    _cache_clear("sites")

    return {"site_id": site_id, "name": name, "location": location,
            "spreadsheet_id": spreadsheet_id or settings.spreadsheet_id,
            "sheet_name": actual_sheet, "created_by": created_by, "created_at": now}


def find_site(site_id: str) -> dict | None:
    ws = get_sites_sheet()
    for r in ws.get_all_records():
        if str(r.get("site_id")) == site_id:
            return r
    return None


def list_sites() -> list[dict]:
    cached = _cache_get("sites")
    if cached is not None:
        return cached
    ws = get_sites_sheet()
    records = ws.get_all_records()
    _cache_set("sites", records)
    return records


def close_site(site_id: str) -> bool:
    """Mark a site as closed by updating its name with [CLOSED] prefix."""
    ws = get_sites_sheet()
    all_vals = ws.get_all_values()
    headers = all_vals[0]
    name_col = headers.index("name") if "name" in headers else None
    sid_col = headers.index("site_id") if "site_id" in headers else None
    if sid_col is None or name_col is None:
        return False
    for idx, row in enumerate(all_vals[1:], start=2):
        if row[sid_col] == site_id:
            current_name = row[name_col]
            if not current_name.startswith("[CLOSED]"):
                ws.update_cell(idx, name_col + 1, f"[CLOSED] {current_name}")
            _cache_clear("sites")
            logger.info("Closed site %s", site_id)
            return True
    return False


def detect_new_sheets() -> list[str]:
    """Scan the spreadsheet for tabs that aren't registered as sites.
    Returns list of new sheet names (excluding APP_ prefixed ones)."""
    sp = _open_spreadsheet()
    all_tabs = [ws.title for ws in sp.worksheets()]
    existing_sites = {str(s.get("site_id", "")) for s in list_sites()}
    app_prefixes = ("APP_", "Sheet")
    new_tabs = [
        t for t in all_tabs
        if t not in existing_sites and not any(t.startswith(p) for p in app_prefixes)
    ]
    return new_tabs


# ═══════════════════════════════════════════════════════════════════
#  CASH ENTRY operations
# ═══════════════════════════════════════════════════════════════════

def _get_entry_worksheet(site_id: str) -> tuple[gspread.Worksheet, dict]:
    """Return (worksheet, site_record) for the given site."""
    site = find_site(site_id)
    if not site:
        raise ValueError(f"Site {site_id} not found")
    sp = _open_spreadsheet(site.get("spreadsheet_id") or settings.spreadsheet_id)
    ws = _ensure_worksheet(sp, site["sheet_name"], HEADER_ROW)
    return ws, site


def add_entry(site_id: str, entry: dict, entered_by: str, batch_id: str = "") -> dict:
    """Append a new cash entry row and return the saved record."""
    ws, site = _get_entry_worksheet(site_id)
    all_vals = ws.get_all_values()
    next_in_no = len(all_vals)

    now = datetime.now(timezone.utc).isoformat()
    entry_id = f"{site_id}-{next_in_no}-{datetime.now(timezone.utc).strftime('%y%m%d%H%M%S')}"

    row = [
        next_in_no,                          # A: In No
        entry["entry_date"],                 # B: Date
        entry.get("bill_no", "Nil"),         # C: Bill No.
        "",                                  # D: V.No
        entry["party_name"],                 # E: Name of Party
        entry["item_description"],           # F: Particulars
        entry["quantity"],                   # G: Qty
        entry["unit"],                       # H: Unit
        entry["rate"],                       # I: Rate
        entry["amount"],                     # J: Amount
        entry.get("ref_ledger", "Material"), # K: Ref Ledger
        "Pending",                           # L: Status
        entered_by,                          # M: Entered By
        entry_id,                            # N: Entry ID
        entry.get("payment_mode", "Cash"),   # O: Payment Mode
        entry.get("remarks", ""),            # P: Remarks
        "",                                  # Q: Invoice URL
        now,                                 # R: Timestamp
        "",                                  # S: Admin Remarks
        batch_id,                            # T: Batch ID
    ]
    ws.append_row(row, value_input_option="RAW")
    _cache_clear(f"entries:{site_id}")
    logger.info("Added entry %s batch=%s to site %s", entry_id, batch_id, site_id)

    return {
        "row_number": next_in_no + 1,
        "entry_id": entry_id,
        "entry_date": entry["entry_date"],
        "bill_no": entry.get("bill_no", "Nil"),
        "party_name": entry["party_name"],
        "item_description": entry["item_description"],
        "quantity": entry["quantity"],
        "unit": entry["unit"],
        "rate": entry["rate"],
        "amount": entry["amount"],
        "payment_mode": entry.get("payment_mode", "Cash"),
        "ref_ledger": entry.get("ref_ledger", "Material"),
        "remarks": entry.get("remarks", ""),
        "entered_by": entered_by,
        "site_id": site_id,
        "status": "Pending",
        "invoice_url": "",
        "timestamp": now,
        "batch_id": batch_id,
    }


def list_entries(site_id: str, status_filter: str | None = None) -> list[dict]:
    """Return all entries for a site, optionally filtered by status."""
    cache_key = f"entries:{site_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        entries = cached
    else:
        ws, _ = _get_entry_worksheet(site_id)
        all_vals = ws.get_all_values()
        if len(all_vals) < 2:
            return []
        headers = all_vals[0]
        entries = []
        for idx, row in enumerate(all_vals[1:], start=2):
            if not any(cell.strip() for cell in row):
                continue
            rec = {h: (row[i] if i < len(row) else "") for i, h in enumerate(headers)}
            entry = _row_to_entry(rec, idx, site_id)
            entries.append(entry)
        _cache_set(cache_key, entries)

    if status_filter:
        return [e for e in entries if e["status"] == status_filter]
    return entries


def _row_to_entry(rec: dict, row_num: int, site_id: str) -> dict:
    """Convert a raw sheet row dict to a CashEntryOut-compatible dict."""
    def _float(v: str) -> float:
        try:
            return float(v)
        except (ValueError, TypeError):
            return 0.0

    return {
        "row_number": row_num,
        "entry_id": rec.get("Entry ID", ""),
        "entry_date": rec.get("Date", ""),
        "bill_no": rec.get("Bill No.", ""),
        "party_name": rec.get("Name of Party", ""),
        "item_description": rec.get("Particulars / Material Detail", ""),
        "quantity": _float(rec.get("Qty", "0")),
        "unit": rec.get("Unit", ""),
        "rate": _float(rec.get("Rate", "0")),
        "amount": _float(rec.get("Amount", "0")),
        "payment_mode": rec.get("Payment Mode", "Cash"),
        "ref_ledger": rec.get("Ref Ledger", ""),
        "remarks": rec.get("Remarks", ""),
        "entered_by": rec.get("Entered By", ""),
        "site_id": site_id,
        "status": rec.get("Status", "Pending"),
        "invoice_url": rec.get("Invoice URL", ""),
        "timestamp": rec.get("Timestamp", ""),
        "batch_id": rec.get("Batch ID", ""),
    }


def update_entry_status(site_id: str, entry_id: str, new_status: str,
                        admin_remarks: str = "") -> bool:
    """Update the Status and Admin Remarks columns for a given entry."""
    ws, _ = _get_entry_worksheet(site_id)
    all_vals = ws.get_all_values()
    headers = all_vals[0]

    entry_id_col = headers.index("Entry ID") if "Entry ID" in headers else None
    status_col = headers.index("Status") if "Status" in headers else None
    remarks_col = headers.index("Admin Remarks") if "Admin Remarks" in headers else None

    if entry_id_col is None or status_col is None:
        logger.error("Required columns not found in sheet")
        return False

    for idx, row in enumerate(all_vals[1:], start=2):
        if idx <= len(all_vals) and entry_id_col < len(row) and row[entry_id_col] == entry_id:
            ws.update_cell(idx, status_col + 1, new_status)
            if remarks_col is not None:
                ws.update_cell(idx, remarks_col + 1, admin_remarks)
            logger.info("Updated entry %s → %s", entry_id, new_status)
            _cache_clear(f"entries:{site_id}")
            return True

    return False


def update_entry_invoice_url(site_id: str, entry_id: str, url: str) -> bool:
    """Set the Invoice URL column for a given entry."""
    ws, _ = _get_entry_worksheet(site_id)
    all_vals = ws.get_all_values()
    headers = all_vals[0]

    entry_id_col = headers.index("Entry ID") if "Entry ID" in headers else None
    url_col = headers.index("Invoice URL") if "Invoice URL" in headers else None

    if entry_id_col is None or url_col is None:
        return False

    for idx, row in enumerate(all_vals[1:], start=2):
        if entry_id_col < len(row) and row[entry_id_col] == entry_id:
            ws.update_cell(idx, url_col + 1, url)
            return True

    return False


# ═══════════════════════════════════════════════════════════════════
#  NOTIFICATIONS (stored in APP_Notifications sheet)
# ═══════════════════════════════════════════════════════════════════
NOTIF_HEADERS = ["id", "target_mobile", "message", "entry_id", "created_at", "read"]


def get_notif_sheet() -> gspread.Worksheet:
    sp = _open_spreadsheet()
    return _ensure_worksheet(sp, META_SHEETS["notifications"], NOTIF_HEADERS)


def add_notification(target_mobile: str, message: str, entry_id: str = "") -> dict:
    ws = get_notif_sheet()
    now = datetime.now(timezone.utc).isoformat()
    nid = f"N-{datetime.now(timezone.utc).strftime('%y%m%d%H%M%S%f')}"
    ws.append_row([nid, target_mobile, message, entry_id, now, "false"], value_input_option="RAW")
    return {"id": nid, "message": message, "entry_id": entry_id, "created_at": now, "read": False}


def get_notifications(mobile: str) -> list[dict]:
    ws = get_notif_sheet()
    records = ws.get_all_records()
    # Only return notifications from the last 2 days
    cutoff = datetime.now(timezone.utc).timestamp() - (2 * 24 * 3600)
    result = []
    for r in records:
        if str(r.get("target_mobile")) != mobile:
            continue
        created = r.get("created_at", "")
        try:
            ts = datetime.fromisoformat(created.replace("Z", "+00:00")).timestamp()
            if ts < cutoff:
                continue
        except (ValueError, TypeError):
            pass
        result.append({
            "id": r["id"], "message": r["message"], "entry_id": str(r.get("entry_id", "")),
            "created_at": created, "read": str(r.get("read", "false")).lower() == "true",
        })
    return result


def mark_notification_read(notif_id: str) -> bool:
    ws = get_notif_sheet()
    all_vals = ws.get_all_values()
    for idx, row in enumerate(all_vals[1:], start=2):
        if row and row[0] == notif_id:
            ws.update_cell(idx, 6, "true")
            return True
    return False


# ═══════════════════════════════════════════════════════════════════
#  VENDOR management (stored in APP_Vendors sheet)
# ═══════════════════════════════════════════════════════════════════
VENDOR_HEADERS = ["vendor_id", "name", "contact", "address", "category", "site_ids", "created_by", "created_at"]


def get_vendors_sheet() -> gspread.Worksheet:
    sp = _open_spreadsheet()
    return _ensure_worksheet(sp, "APP_Vendors", VENDOR_HEADERS)


def create_vendor(name: str, contact: str, address: str, category: str,
                  site_ids: str, created_by: str) -> dict:
    ws = get_vendors_sheet()
    now = datetime.now(timezone.utc).isoformat()
    vid = f"V-{datetime.now(timezone.utc).strftime('%y%m%d%H%M%S')}"
    ws.append_row([vid, name, contact, address, category, site_ids, created_by, now],
                  value_input_option="RAW")
    logger.info("Created vendor %s: %s sites=%s", vid, name, site_ids)
    return {"vendor_id": vid, "name": name, "contact": contact, "address": address,
            "category": category, "site_ids": site_ids, "created_by": created_by, "created_at": now}


def list_vendors(site_id: str | None = None) -> list[dict]:
    ws = get_vendors_sheet()
    records = ws.get_all_records()
    if not site_id:
        return records
    # Filter vendors that belong to the given site (or have no site restriction)
    filtered = []
    for v in records:
        v_sites = str(v.get("site_ids", "")).strip()
        if not v_sites or site_id in [s.strip() for s in v_sites.split(",")]:
            filtered.append(v)
    return filtered


# ═══════════════════════════════════════════════════════════════════
#  ITEM MASTER (stored in APP_ItemMaster sheet)
# ═══════════════════════════════════════════════════════════════════
ITEM_HEADERS = ["item_id", "standard_name", "category", "aliases", "default_unit", "ledger", "created_by", "created_at"]


def get_items_sheet() -> gspread.Worksheet:
    sp = _open_spreadsheet()
    return _ensure_worksheet(sp, "APP_ItemMaster", ITEM_HEADERS)


def create_item(standard_name: str, category: str, aliases: str,
                default_unit: str, ledger: str, created_by: str) -> dict:
    ws = get_items_sheet()
    now = datetime.now(timezone.utc).isoformat()
    iid = f"I-{datetime.now(timezone.utc).strftime('%y%m%d%H%M%S%f')[:18]}"
    ws.append_row([iid, standard_name, category, aliases, default_unit, ledger, created_by, now],
                  value_input_option="RAW")
    logger.info("Created item %s: %s", iid, standard_name)
    return {"item_id": iid, "standard_name": standard_name, "category": category,
            "aliases": aliases, "default_unit": default_unit, "ledger": ledger,
            "created_by": created_by, "created_at": now}


def list_items() -> list[dict]:
    ws = get_items_sheet()
    return ws.get_all_records()


def get_items_grouped() -> list[dict]:
    """Return items grouped by category for the dropdown."""
    records = list_items()
    groups: dict[str, list] = {}
    for r in records:
        cat = str(r.get("category", "General"))
        if cat not in groups:
            groups[cat] = []
        groups[cat].append({
            "standard_name": r["standard_name"],
            "aliases": str(r.get("aliases", "")),
            "default_unit": str(r.get("default_unit", "No.")),
            "ledger": str(r.get("ledger", "Material")),
        })
    return [{"name": k, "items": v} for k, v in groups.items()]


def update_vendor(vendor_id: str, name: str | None = None, contact: str | None = None,
                  address: str | None = None, category: str | None = None,
                  site_ids: str | None = None) -> bool:
    """Update vendor fields."""
    ws = get_vendors_sheet()
    all_vals = ws.get_all_values()
    headers = all_vals[0]
    col_map = {h: i for i, h in enumerate(headers)}
    vid_col = col_map.get("vendor_id")
    if vid_col is None:
        return False
    for idx, row in enumerate(all_vals[1:], start=2):
        if idx <= len(all_vals) and row[vid_col] == vendor_id:
            if name is not None and "name" in col_map:
                ws.update_cell(idx, col_map["name"] + 1, name)
            if contact is not None and "contact" in col_map:
                ws.update_cell(idx, col_map["contact"] + 1, contact)
            if address is not None and "address" in col_map:
                ws.update_cell(idx, col_map["address"] + 1, address)
            if category is not None and "category" in col_map:
                ws.update_cell(idx, col_map["category"] + 1, category)
            if site_ids is not None and "site_ids" in col_map:
                ws.update_cell(idx, col_map["site_ids"] + 1, site_ids)
            logger.info("Updated vendor %s", vendor_id)
            return True
    return False


def update_item(item_id: str, standard_name: str | None = None, category: str | None = None,
                aliases: str | None = None, default_unit: str | None = None,
                ledger: str | None = None) -> bool:
    """Update item master fields."""
    ws = get_items_sheet()
    all_vals = ws.get_all_values()
    headers = all_vals[0]
    col_map = {h: i for i, h in enumerate(headers)}
    iid_col = col_map.get("item_id")
    if iid_col is None:
        return False
    for idx, row in enumerate(all_vals[1:], start=2):
        if idx <= len(all_vals) and row[iid_col] == item_id:
            if standard_name is not None and "standard_name" in col_map:
                ws.update_cell(idx, col_map["standard_name"] + 1, standard_name)
            if category is not None and "category" in col_map:
                ws.update_cell(idx, col_map["category"] + 1, category)
            if aliases is not None and "aliases" in col_map:
                ws.update_cell(idx, col_map["aliases"] + 1, aliases)
            if default_unit is not None and "default_unit" in col_map:
                ws.update_cell(idx, col_map["default_unit"] + 1, default_unit)
            if ledger is not None and "ledger" in col_map:
                ws.update_cell(idx, col_map["ledger"] + 1, ledger)
            _cache_clear("items")
            logger.info("Updated item %s", item_id)
            return True
    return False


# ═══════════════════════════════════════════════════════════════════
#  FUND RELEASE (stored in APP_Funds sheet)
# ═══════════════════════════════════════════════════════════════════
FUND_HEADERS = ["fund_id", "date", "site_id", "engineer_mobile", "engineer_name",
                "amount", "payment_mode", "remarks", "released_by", "created_at"]


def get_funds_sheet() -> gspread.Worksheet:
    sp = _open_spreadsheet()
    return _ensure_worksheet(sp, "APP_Funds", FUND_HEADERS)


def release_fund(site_id: str, engineer_mobile: str, engineer_name: str,
                 amount: float, date: str, payment_mode: str,
                 remarks: str, released_by: str) -> dict:
    ws = get_funds_sheet()
    now = datetime.now(timezone.utc).isoformat()
    fid = f"F-{datetime.now(timezone.utc).strftime('%y%m%d%H%M%S')}"
    ws.append_row([fid, date, site_id, str(engineer_mobile), engineer_name,
                   str(amount), payment_mode, remarks, released_by, now],
                  value_input_option="RAW")
    logger.info("Fund released %s: ₹%s to %s at %s", fid, amount, engineer_name, site_id)
    return {"fund_id": fid, "date": date, "site_id": site_id,
            "engineer_mobile": str(engineer_mobile), "engineer_name": engineer_name,
            "amount": amount, "payment_mode": payment_mode,
            "remarks": remarks, "released_by": released_by, "created_at": now}


def list_funds(site_id: str | None = None, engineer_mobile: str | None = None) -> list[dict]:
    cached = _cache_get(f"funds:{site_id or 'all'}:{engineer_mobile or 'all'}")
    if cached is not None:
        return cached
    ws = get_funds_sheet()
    records = ws.get_all_records()
    result = []
    for r in records:
        r["engineer_mobile"] = str(r.get("engineer_mobile", ""))
        r["amount"] = float(r.get("amount", 0) or 0)
        if site_id and str(r.get("site_id", "")) != site_id:
            continue
        if engineer_mobile and r["engineer_mobile"] != str(engineer_mobile):
            continue
        result.append(r)
    _cache_set(f"funds:{site_id or 'all'}:{engineer_mobile or 'all'}", result)
    return result


def get_fund_summary(site_id: str | None = None) -> dict:
    """Get fund reconciliation: given vs spent per site per engineer."""
    funds = list_funds(site_id=site_id)
    # Group funds by site+engineer
    fund_by_site_eng: dict[str, dict[str, float]] = {}
    for f in funds:
        sid = str(f.get("site_id", ""))
        eng = f.get("engineer_name", "Unknown")
        key = f"{sid}|{eng}"
        fund_by_site_eng[key] = fund_by_site_eng.get(key, 0) + float(f.get("amount", 0))

    return {"fund_releases": funds, "totals_by_site_engineer": fund_by_site_eng}


def update_entry_fields(site_id: str, entry_id: str, fields: dict) -> bool:
    """Update specific fields of an entry (qty, rate, amount, payment_mode)."""
    ws, _ = _get_entry_worksheet(site_id)
    all_vals = ws.get_all_values()
    headers = all_vals[0]
    col_map = {h: i for i, h in enumerate(headers)}

    entry_id_col = col_map.get("Entry ID")
    if entry_id_col is None:
        return False

    for idx, row in enumerate(all_vals[1:], start=2):
        if entry_id_col < len(row) and row[entry_id_col] == entry_id:
            if "quantity" in fields and "Qty" in col_map:
                ws.update_cell(idx, col_map["Qty"] + 1, str(fields["quantity"]))
            if "rate" in fields and "Rate" in col_map:
                ws.update_cell(idx, col_map["Rate"] + 1, str(fields["rate"]))
            if "amount" in fields and "Amount" in col_map:
                ws.update_cell(idx, col_map["Amount"] + 1, str(fields["amount"]))
            if "payment_mode" in fields and "Payment Mode" in col_map:
                ws.update_cell(idx, col_map["Payment Mode"] + 1, fields["payment_mode"])
            _cache_clear(f"entries:{site_id}")
            logger.info("Updated entry fields %s: %s", entry_id, fields)
            return True
    return False
