"""
Loyalty Programs API.

Public:
  GET  /loyalty-programs          — list active programs (app consumes this)
  GET  /loyalty-programs/version  — lightweight updated_at check

Admin:
  GET    /admin/loyalty-programs        — full list (incl. inactive)
  POST   /admin/loyalty-programs        — create
  PUT    /admin/loyalty-programs/{id}   — update
  DELETE /admin/loyalty-programs/{id}   — delete
  POST   /admin/loyalty-programs/broadcast — push notify all devices
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from ..auth import get_admin_user, get_current_user
from ..database import get_db, SessionLocal
from ..models.loyalty_program import LoyaltyProgram
from ..models.push_token import PushToken
from ..models.user import User
from ..services.push_notifications import send_push_notifications

logger = logging.getLogger(__name__)

router = APIRouter(tags=["loyalty-programs"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class DetectionRules(BaseModel):
    prefixes: List[str] = []
    lengths: List[int] = []
    symbology: List[str] = []


class LoyaltyProgramOut(BaseModel):
    id: str
    slug: str
    name: str
    logo_url: Optional[str] = None
    logo_background: Optional[str] = None
    detection_rules: DetectionRules
    is_active: bool
    sort_order: int
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LoyaltyProgramCreate(BaseModel):
    slug: str
    name: str
    logo_url: Optional[str] = None
    logo_background: Optional[str] = None
    detection_rules: DetectionRules = DetectionRules()
    is_active: bool = True
    sort_order: int = 0


class LoyaltyProgramUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None
    logo_background: Optional[str] = None
    detection_rules: Optional[DetectionRules] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class ProgramsResponse(BaseModel):
    updated_at: Optional[str] = None
    programs: List[LoyaltyProgramOut]


class VersionResponse(BaseModel):
    updated_at: Optional[str] = None
    count: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _row_to_out(row: LoyaltyProgram) -> LoyaltyProgramOut:
    try:
        rules = DetectionRules(**json.loads(row.detection_rules or "{}"))
    except Exception:
        rules = DetectionRules()
    return LoyaltyProgramOut(
        id=row.id,
        slug=row.slug,
        name=row.name,
        logo_url=row.logo_url,
        logo_background=row.logo_background,
        detection_rules=rules,
        is_active=row.is_active,
        sort_order=row.sort_order,
        updated_at=row.updated_at,
    )


async def _broadcast_loyalty_update_bg() -> None:
    """Background: send silent push to all devices to re-fetch loyalty programs."""
    CHUNK = 100
    db = SessionLocal()
    try:
        offset = 0
        total = 0
        while True:
            tokens = [
                pt.token
                for pt in db.query(PushToken.token)
                .order_by(PushToken.id)
                .offset(offset)
                .limit(CHUNK)
                .all()
            ]
            if not tokens:
                break
            await send_push_notifications(
                tokens=tokens,
                data={"type": "loyalty_programs_updated"},
                content_available=True,
            )
            total += len(tokens)
            if len(tokens) < CHUNK:
                break
            offset += CHUNK
        logger.info(f"Broadcast loyalty_programs_updated to {total} devices")
    except Exception as e:
        logger.error(f"Error broadcasting loyalty update: {e}")
    finally:
        db.close()


# ── Public endpoints ──────────────────────────────────────────────────────────

@router.get("/loyalty-programs/version", response_model=VersionResponse)
def get_loyalty_programs_version(db: Session = Depends(get_db)):
    """
    Lightweight check — app polls this on startup to see if a full re-fetch
    is needed by comparing the returned updated_at to its cached value.
    """
    latest = (
        db.query(sa_func.max(LoyaltyProgram.updated_at))
        .filter(LoyaltyProgram.is_active == True)
        .scalar()
    )
    count = (
        db.query(sa_func.count(LoyaltyProgram.id))
        .filter(LoyaltyProgram.is_active == True)
        .scalar()
    )
    return VersionResponse(
        updated_at=latest.isoformat() if latest else None,
        count=count or 0,
    )


@router.get("/loyalty-programs", response_model=ProgramsResponse)
def get_loyalty_programs(db: Session = Depends(get_db)):
    """
    Return all active loyalty programs ordered by sort_order then name.
    The app caches this response and re-fetches when updated_at changes.
    """
    rows = (
        db.query(LoyaltyProgram)
        .filter(LoyaltyProgram.is_active == True)
        .order_by(LoyaltyProgram.sort_order, LoyaltyProgram.name)
        .all()
    )
    latest = max((r.updated_at for r in rows if r.updated_at), default=None)
    return ProgramsResponse(
        updated_at=latest.isoformat() if latest else None,
        programs=[_row_to_out(r) for r in rows],
    )


# ── Admin endpoints ───────────────────────────────────────────────────────────

@router.get("/admin/loyalty-programs", response_model=List[LoyaltyProgramOut])
def admin_list_programs(
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(LoyaltyProgram)
        .order_by(LoyaltyProgram.sort_order, LoyaltyProgram.name)
        .all()
    )
    return [_row_to_out(r) for r in rows]


@router.post("/admin/loyalty-programs", response_model=LoyaltyProgramOut, status_code=201)
def admin_create_program(
    body: LoyaltyProgramCreate,
    background_tasks: BackgroundTasks,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    existing = db.query(LoyaltyProgram).filter(LoyaltyProgram.slug == body.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Slug '{body.slug}' already exists")

    row = LoyaltyProgram(
        id=str(uuid.uuid4()),
        slug=body.slug,
        name=body.name,
        logo_url=body.logo_url,
        logo_background=body.logo_background,
        detection_rules=json.dumps(body.detection_rules.model_dump()),
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    background_tasks.add_task(_broadcast_loyalty_update_bg)
    return _row_to_out(row)


@router.put("/admin/loyalty-programs/{program_id}", response_model=LoyaltyProgramOut)
def admin_update_program(
    program_id: str,
    body: LoyaltyProgramUpdate,
    background_tasks: BackgroundTasks,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    row = db.query(LoyaltyProgram).filter(LoyaltyProgram.id == program_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Program not found")

    if body.name is not None:
        row.name = body.name
    if body.logo_url is not None:
        row.logo_url = body.logo_url if body.logo_url != "" else None
    if body.logo_background is not None:
        row.logo_background = body.logo_background if body.logo_background != "" else None
    if body.detection_rules is not None:
        row.detection_rules = json.dumps(body.detection_rules.model_dump())
    if body.is_active is not None:
        row.is_active = body.is_active
    if body.sort_order is not None:
        row.sort_order = body.sort_order

    # updated_at is handled by onupdate=func.now() on the model (DB-side NOW())
    # which stays consistent with CURRENT_TIMESTAMP on created_at/other columns.

    db.commit()
    db.refresh(row)
    background_tasks.add_task(_broadcast_loyalty_update_bg)
    return _row_to_out(row)


@router.delete("/admin/loyalty-programs/{program_id}", status_code=204)
def admin_delete_program(
    program_id: str,
    background_tasks: BackgroundTasks,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    row = db.query(LoyaltyProgram).filter(LoyaltyProgram.id == program_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Program not found")
    db.delete(row)
    db.commit()
    background_tasks.add_task(_broadcast_loyalty_update_bg)


@router.post("/admin/loyalty-programs/broadcast", status_code=202)
def admin_broadcast_update(
    background_tasks: BackgroundTasks,
    _: User = Depends(get_admin_user),
):
    """Manually push a loyalty_programs_updated notification to all devices."""
    background_tasks.add_task(_broadcast_loyalty_update_bg)
    return {"ok": True}
