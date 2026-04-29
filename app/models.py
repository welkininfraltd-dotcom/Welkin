"""Pydantic models for request/response validation."""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────
class Role(str, Enum):
    admin = "admin"
    site_engineer = "site_engineer"


class PaymentMode(str, Enum):
    cash = "Cash"
    upi = "UPI"
    bank_transfer = "Bank Transfer"
    challan = "Challan"
    credit = "Credit"


class EntryStatus(str, Enum):
    pending = "Pending"
    approved = "Approved"
    rejected = "Rejected"


# ── Auth ───────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    mobile: str = Field(..., pattern=r"^\d{10}$")
    password: str = Field(..., min_length=4)
    site_ids: Optional[str] = None  # comma-separated: "KCJ-ROAD,NH47-BRIDGE"


class UserLogin(BaseModel):
    mobile: str = Field(..., pattern=r"^\d{10}$")
    password: str


class UserOut(BaseModel):
    mobile: str
    name: str
    role: Role
    site_ids: Optional[str] = None  # comma-separated site IDs
    site_names: Optional[str] = None  # comma-separated site names


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Site ───────────────────────────────────────────────────────────
class SiteCreate(BaseModel):
    site_id: str = Field(..., min_length=2, max_length=30)
    name: str = Field(..., min_length=2, max_length=150)
    location: str = ""
    spreadsheet_id: Optional[str] = None
    sheet_name: str = "Sheet1"


class SiteOut(BaseModel):
    site_id: str
    name: str
    location: str
    spreadsheet_id: str
    sheet_name: str
    created_by: str
    created_at: str


# ── Cash Entry ─────────────────────────────────────────────────────
class CashEntryCreate(BaseModel):
    entry_date: date
    bill_no: str = "Nil"
    party_name: str
    item_description: str
    quantity: float = Field(..., gt=0)
    unit: str
    rate: float = Field(..., ge=0)
    amount: float = Field(..., ge=0)
    payment_mode: PaymentMode = PaymentMode.cash
    ref_ledger: str = "Material"
    remarks: str = ""


class CashEntryOut(BaseModel):
    row_number: int
    entry_id: str
    entry_date: str
    bill_no: str
    party_name: str
    item_description: str
    quantity: float
    unit: str
    rate: float
    amount: float
    payment_mode: str
    ref_ledger: str
    remarks: str
    entered_by: str
    site_id: str
    status: EntryStatus = EntryStatus.pending
    invoice_url: Optional[str] = None
    timestamp: str


# ── Reconciliation ─────────────────────────────────────────────────
class ReconcileAction(BaseModel):
    entry_id: str
    action: EntryStatus  # approved or rejected
    admin_remarks: str = ""


# ── Notification ───────────────────────────────────────────────────
class Notification(BaseModel):
    id: str
    message: str
    entry_id: Optional[str] = None
    created_at: str
    read: bool = False


# ── Summary ────────────────────────────────────────────────────────
class SiteSummary(BaseModel):
    total_entries: int
    total_amount: float
    pending_count: int
    approved_count: int
    rejected_count: int
    category_totals: dict[str, float]
    top_vendors: list[dict]
