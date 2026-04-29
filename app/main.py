"""Construction Cash Tracker — FastAPI application entry point."""
from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings, BASE_DIR, UPLOAD_DIR
from app.models import (
    UserCreate, UserLogin, UserOut, Token, Role,
    SiteCreate, SiteOut,
    CashEntryCreate, CashEntryOut, EntryStatus,
    ReconcileAction, Notification,
)
from app.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_admin,
)
from app import sheets_service, drive_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_title, version="1.0.0")

# Serve static frontend files
STATIC_DIR = BASE_DIR / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ── Startup: ensure default admin exists ───────────────────────────
@app.on_event("startup")
async def startup_event():
    """Create the default admin user if it does not exist yet."""
    import asyncio
    for attempt in range(3):
        try:
            existing = sheets_service.find_user(settings.admin_mobile)
            if not existing:
                sheets_service.create_user(
                    mobile=settings.admin_mobile,
                    name=settings.admin_name,
                    password_hash=hash_password("admin123"),
                    role=Role.admin,
                )
                logger.info("Default admin created: %s", settings.admin_mobile)
            return
        except Exception as e:
            logger.warning("Startup attempt %d failed: %s", attempt + 1, e)
            await asyncio.sleep(2)
    logger.warning("Could not initialise admin user after 3 attempts")


# ═══════════════════════════════════════════════════════════════════
#  AUTH endpoints
# ═══════════════════════════════════════════════════════════════════

@app.post("/api/auth/login", response_model=Token)
async def login(body: UserLogin):
    user = sheets_service.find_user(body.mobile)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid mobile or password")

    # Resolve site names from comma-separated site_ids
    raw_sites = str(user.get("site_ids", user.get("site_id", "")))
    site_id_list = [s.strip() for s in raw_sites.split(",") if s.strip()]
    site_names = []
    for sid in site_id_list:
        site = sheets_service.find_site(sid)
        if site:
            site_names.append(site["name"])

    mobile_str = str(user["mobile"])
    token = create_access_token({"sub": mobile_str, "role": user["role"], "name": user["name"],
                                  "site_ids": raw_sites})
    return Token(
        access_token=token,
        user=UserOut(mobile=mobile_str, name=user["name"], role=user["role"],
                     site_ids=raw_sites, site_names=", ".join(site_names)),
    )


# ═══════════════════════════════════════════════════════════════════
#  USER management (admin only)
# ═══════════════════════════════════════════════════════════════════

@app.post("/api/users", response_model=UserOut)
async def create_site_engineer(body: UserCreate, admin: dict = Depends(require_admin)):
    """Admin creates a site engineer account (mobile + password). site_ids is comma-separated."""
    if sheets_service.find_user(body.mobile):
        raise HTTPException(status_code=409, detail="User with this mobile already exists")
    sheets_service.create_user(
        mobile=body.mobile, name=body.name,
        password_hash=hash_password(body.password),
        role=Role.site_engineer, site_id=body.site_ids or "",
    )
    return UserOut(mobile=body.mobile, name=body.name, role=Role.site_engineer, site_ids=body.site_ids)


@app.get("/api/users", response_model=list[UserOut])
async def get_users(admin: dict = Depends(require_admin)):
    users = sheets_service.list_users()
    return [
        UserOut(mobile=str(u["mobile"]), name=u["name"], role=u["role"],
                site_ids=str(u.get("site_ids", u.get("site_id", ""))))
        for u in users
    ]


# Edit user (admin only)
@app.put("/api/users/{mobile}")
async def edit_user(mobile: str, name: str = Form(None), site_ids: str = Form(None),
                    password: str = Form(None), admin: dict = Depends(require_admin)):
    pw_hash = hash_password(password) if password else None
    ok = sheets_service.update_user(mobile, name=name, site_ids=site_ids, password_hash=pw_hash)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "mobile": mobile}


# Edit vendor (any user)
@app.put("/api/vendors/{vendor_id}")
async def edit_vendor(vendor_id: str, name: str = Form(None), contact: str = Form(None),
                      address: str = Form(None), category: str = Form(None),
                      site_ids: str = Form(None), user: dict = Depends(get_current_user)):
    ok = sheets_service.update_vendor(vendor_id, name=name, contact=contact,
                                       address=address, category=category, site_ids=site_ids)
    if not ok:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return {"success": True, "vendor_id": vendor_id}


# Edit item (any user)
@app.put("/api/items/{item_id}")
async def edit_item(item_id: str, standard_name: str = Form(None), category: str = Form(None),
                    aliases: str = Form(None), default_unit: str = Form(None),
                    ledger: str = Form(None), user: dict = Depends(get_current_user)):
    ok = sheets_service.update_item(item_id, standard_name=standard_name, category=category,
                                     aliases=aliases, default_unit=default_unit, ledger=ledger)
    if not ok:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True, "item_id": item_id}


# ═══════════════════════════════════════════════════════════════════
#  SITE management (admin only)
# ═══════════════════════════════════════════════════════════════════

@app.post("/api/sites", response_model=SiteOut)
async def create_site(body: SiteCreate, admin: dict = Depends(require_admin)):
    if sheets_service.find_site(body.site_id):
        raise HTTPException(status_code=409, detail="Site ID already exists")
    site = sheets_service.create_site(
        site_id=body.site_id, name=body.name, location=body.location,
        spreadsheet_id=body.spreadsheet_id or settings.spreadsheet_id,
        sheet_name=body.sheet_name, created_by=admin["name"],
    )
    return SiteOut(**site)


@app.get("/api/sites", response_model=list[SiteOut])
async def get_sites(user: dict = Depends(get_current_user)):
    sites = sheets_service.list_sites()
    # Site engineers only see their assigned sites (can be multiple)
    if user.get("role") == Role.site_engineer:
        user_site_ids = [s.strip() for s in str(user.get("site_ids", "")).split(",") if s.strip()]
        if user_site_ids:
            sites = [s for s in sites if str(s.get("site_id")) in user_site_ids]
    return [SiteOut(**s) for s in sites]


@app.post("/api/sites/{site_id}/close")
async def close_site(site_id: str, admin: dict = Depends(require_admin)):
    ok = sheets_service.close_site(site_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Site not found")
    return {"success": True, "site_id": site_id, "status": "closed"}


@app.get("/api/sites/detect")
async def detect_new_sheets(admin: dict = Depends(require_admin)):
    new_tabs = sheets_service.detect_new_sheets()
    return {"new_sheets": new_tabs}


@app.post("/api/cache/clear")
async def clear_cache(user: dict = Depends(get_current_user)):
    """Clear server-side cache to force fresh data from sheets."""
    sheets_service._cache_clear()
    return {"success": True}


# ═══════════════════════════════════════════════════════════════════
#  CASH ENTRY endpoints
# ═══════════════════════════════════════════════════════════════════

@app.post("/api/entries/{site_id}", response_model=CashEntryOut)
async def create_entry(site_id: str, body: CashEntryCreate, user: dict = Depends(get_current_user)):
    """Create a new cash entry. Admin entries are auto-approved."""
    # Site engineers can only post to their assigned sites
    if user.get("role") == Role.site_engineer:
        user_sites = [s.strip() for s in str(user.get("site_ids", "")).split(",") if s.strip()]
        if user_sites and site_id not in user_sites:
            raise HTTPException(status_code=403, detail="You can only add entries to your assigned sites")

    entry_data = body.model_dump()
    entry_data["entry_date"] = body.entry_date.isoformat()
    result = sheets_service.add_entry(site_id, entry_data, entered_by=user["name"])

    # Admin entries are auto-approved
    is_admin = user.get("role") in ("admin", "Role.admin")
    if is_admin:
        sheets_service.update_entry_status(site_id, result["entry_id"], "Approved", "Auto-approved (admin)")
        result["status"] = "Approved"
    else:
        # Notify admin about new entry from site engineer
        _notify_admin(
            f"New entry by {user['name']} at {site_id}: {body.item_description} "
            f"₹{body.amount:,.0f} to {body.party_name}",
            result["entry_id"],
        )

    return CashEntryOut(**result)


@app.get("/api/entries/{site_id}", response_model=list[CashEntryOut])
async def get_entries(
    site_id: str,
    status: str | None = Query(None),
    user: dict = Depends(get_current_user),
):
    if user.get("role") == Role.site_engineer:
        user_sites = [s.strip() for s in str(user.get("site_ids", "")).split(",") if s.strip()]
        if user_sites and site_id not in user_sites:
            raise HTTPException(status_code=403, detail="Access denied to this site")
    entries = sheets_service.list_entries(site_id, status_filter=status)
    # Site engineers only see their own entries
    if user.get("role") == Role.site_engineer:
        entries = [e for e in entries if e.get("entered_by") == user.get("name")]
    return [CashEntryOut(**e) for e in entries]


# ═══════════════════════════════════════════════════════════════════
#  RECONCILIATION (admin only)
# ═══════════════════════════════════════════════════════════════════

@app.post("/api/reconcile/{site_id}")
async def reconcile_entry(site_id: str, body: ReconcileAction, admin: dict = Depends(require_admin)):
    """Admin approves or rejects a cash entry."""
    if body.action not in (EntryStatus.approved, EntryStatus.rejected):
        raise HTTPException(status_code=400, detail="Action must be 'Approved' or 'Rejected'")

    ok = sheets_service.update_entry_status(site_id, body.entry_id, body.action.value, body.admin_remarks)
    if not ok:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Notify the site engineer
    entries = sheets_service.list_entries(site_id)
    entry = next((e for e in entries if e["entry_id"] == body.entry_id), None)
    if entry:
        engineer = sheets_service.find_user(
            next((u["mobile"] for u in sheets_service.list_users() if u["name"] == entry["entered_by"]), "")
        )
        if engineer:
            sheets_service.add_notification(
                str(engineer["mobile"]),
                f"Entry {body.entry_id} has been {body.action.value} by admin. {body.admin_remarks}",
                body.entry_id,
            )

    return {"success": True, "entry_id": body.entry_id, "status": body.action.value}


# ═══════════════════════════════════════════════════════════════════
#  FUND RELEASE (admin gives money to site engineers)
# ═══════════════════════════════════════════════════════════════════

@app.post("/api/funds")
async def release_fund(
    site_id: str = Form(...), engineer_mobile: str = Form(...),
    engineer_name: str = Form(...), amount: float = Form(...),
    date: str = Form(...), payment_mode: str = Form("Cash"),
    remarks: str = Form(""), admin: dict = Depends(require_admin),
):
    """Admin releases funds to a site engineer for a site."""
    fund = sheets_service.release_fund(
        site_id, engineer_mobile, engineer_name, amount,
        date, payment_mode, remarks, admin["name"],
    )
    # Notify the engineer
    sheets_service.add_notification(
        engineer_mobile,
        f"₹{amount:,.0f} released to you for site {site_id} by {admin['name']}",
        fund["fund_id"],
    )
    return fund


@app.get("/api/funds")
async def get_funds(
    site_id: str | None = Query(None),
    engineer_mobile: str | None = Query(None),
    user: dict = Depends(get_current_user),
):
    """Get fund releases. Admin sees all, engineer sees their own."""
    if user.get("role") == Role.site_engineer:
        return sheets_service.list_funds(site_id=site_id, engineer_mobile=user["sub"])
    return sheets_service.list_funds(site_id=site_id, engineer_mobile=engineer_mobile)


@app.get("/api/funds/reconciliation")
async def get_fund_reconciliation(
    site_id: str | None = Query(None),
    user: dict = Depends(get_current_user),
):
    """Get fund reconciliation: given vs spent per site per engineer."""
    # Get all funds
    funds = sheets_service.list_funds(site_id=site_id)
    # Get all entries across sites
    sites = sheets_service.list_sites()
    if site_id:
        sites = [s for s in sites if str(s.get("site_id")) == site_id]

    # Calculate given per site+engineer
    given: dict[str, dict[str, float]] = {}  # site -> engineer -> amount
    for f in funds:
        sid = str(f.get("site_id", ""))
        eng = f.get("engineer_name", "Unknown")
        given.setdefault(sid, {}).setdefault(eng, 0)
        given[sid][eng] += float(f.get("amount", 0))

    # Calculate spent per site+engineer
    spent: dict[str, dict[str, float]] = {}
    for site in sites:
        sid = str(site.get("site_id", ""))
        if site.get("name", "").startswith("[CLOSED]"):
            continue
        entries = sheets_service.list_entries(sid)
        for e in entries:
            eng = e.get("entered_by", "Unknown")
            spent.setdefault(sid, {}).setdefault(eng, 0)
            spent[sid][eng] += float(e.get("amount", 0))

    # Build reconciliation
    recon = []
    all_keys = set()
    for sid in set(list(given.keys()) + list(spent.keys())):
        for eng in set(list(given.get(sid, {}).keys()) + list(spent.get(sid, {}).keys())):
            g = given.get(sid, {}).get(eng, 0)
            s = spent.get(sid, {}).get(eng, 0)
            recon.append({
                "site_id": sid,
                "engineer": eng,
                "fund_given": g,
                "fund_spent": s,
                "balance": g - s,
            })

    total_given = sum(r["fund_given"] for r in recon)
    total_spent = sum(r["fund_spent"] for r in recon)

    return {
        "reconciliation": recon,
        "total_given": total_given,
        "total_spent": total_spent,
        "total_balance": total_given - total_spent,
    }


# ═══════════════════════════════════════════════════════════════════
#  INVOICE IMAGE upload / retrieve (local storage)
# ═══════════════════════════════════════════════════════════════════

@app.post("/api/invoices/{site_id}/{entry_id}")
async def upload_invoice(
    site_id: str,
    entry_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload an invoice image (camera capture or file pick)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    suffix = Path(file.filename).suffix
    tmp_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    content = await file.read()
    tmp_path.write_bytes(content)

    try:
        link = drive_service.upload_invoice(tmp_path, file.filename, site_id, entry_id)
        sheets_service.update_entry_invoice_url(site_id, entry_id, link)
        return {"success": True, "url": link, "entry_id": entry_id}
    finally:
        tmp_path.unlink(missing_ok=True)


@app.get("/api/invoices/{site_id}")
async def get_invoices(
    site_id: str,
    entry_id: str | None = Query(None),
    user: dict = Depends(get_current_user),
):
    return drive_service.list_invoices(site_id, entry_id)


@app.get("/api/invoices/file/{site_id}/{filename}")
async def serve_invoice_file(site_id: str, filename: str):
    """Serve an uploaded invoice file."""
    file_path = UPLOAD_DIR / site_id / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(file_path))


# ═══════════════════════════════════════════════════════════════════
#  NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/notifications", response_model=list[Notification])
async def get_notifications(user: dict = Depends(get_current_user)):
    return sheets_service.get_notifications(user["sub"])


@app.post("/api/notifications/{notif_id}/read")
async def mark_read(notif_id: str, user: dict = Depends(get_current_user)):
    sheets_service.mark_notification_read(notif_id)
    return {"success": True}


def _notify_admin(message: str, entry_id: str = ""):
    """Send a notification to all admin users."""
    try:
        users = sheets_service.list_users()
        for u in users:
            if u.get("role") == Role.admin:
                sheets_service.add_notification(str(u["mobile"]), message, entry_id)
    except Exception as e:
        logger.warning("Failed to send admin notification: %s", e)


# ═══════════════════════════════════════════════════════════════════
#  VENDOR management
# ═══════════════════════════════════════════════════════════════════

@app.post("/api/vendors")
async def create_vendor(
    name: str = Form(...), contact: str = Form(""), address: str = Form(""),
    category: str = Form("General"), site_ids: str = Form(""),
    user: dict = Depends(get_current_user),
):
    vendor = sheets_service.create_vendor(name, contact, address, category, site_ids, user["name"])
    return vendor


@app.get("/api/vendors")
async def get_vendors(site_id: str | None = Query(None), user: dict = Depends(get_current_user)):
    return sheets_service.list_vendors(site_id)


# ═══════════════════════════════════════════════════════════════════
#  ITEM MASTER
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/items")
async def get_item_master():
    from app.item_master import UNITS, LEDGER_TYPES, PAYMENT_MODES, ITEM_CATEGORIES
    try:
        categories = sheets_service.get_items_grouped()
        if not categories:
            categories = ITEM_CATEGORIES
    except Exception:
        categories = ITEM_CATEGORIES
    return {
        "categories": categories,
        "units": UNITS,
        "ledger_types": LEDGER_TYPES,
        "payment_modes": PAYMENT_MODES,
    }


@app.get("/api/items/all")
async def get_all_items(user: dict = Depends(get_current_user)):
    try:
        return sheets_service.list_items()
    except Exception:
        return []


@app.post("/api/items")
async def add_item(
    standard_name: str = Form(...), category: str = Form("General"),
    aliases: str = Form(""), default_unit: str = Form("No."),
    ledger: str = Form("Material"), user: dict = Depends(get_current_user),
):
    return sheets_service.create_item(standard_name, category, aliases, default_unit, ledger, user["name"])


# ═══════════════════════════════════════════════════════════════════
#  HEALTH CHECK & FRONTEND
# ═══════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/", response_class=HTMLResponse)
async def serve_app():
    index = STATIC_DIR / "index.html"
    if index.exists():
        return index.read_text(encoding="utf-8")
    return HTMLResponse("<h2>Static files not found. Run the build or place files in /static/</h2>")


@app.get("/manifest.json")
async def manifest():
    return {
        "name": "Welkin Builders - Cash Tracker",
        "short_name": "Welkin Cash",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0b3d5c",
        "theme_color": "#0b3d5c",
        "icons": [
            {"src": "/static/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/static/icon-512.png", "sizes": "512x512", "type": "image/png"},
        ],
    }
