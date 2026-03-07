from fastapi import APIRouter, Depends, HTTPException, Request, status, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from ..database import get_db, SessionLocal
from ..models import AppAdmin, PushToken
from ..auth import get_admin_user, get_current_user
from ..models.user import User
from ..services.push_notifications import broadcast_maintenance_update
from ..services.audit import log_audit
import logging

logger = logging.getLogger(__name__)


async def _broadcast_maintenance_background(maintenance: bool, message: str) -> None:
    """
    Background task: pages through push tokens in chunks and broadcasts the
    maintenance update without loading the full token table into request memory.
    Each chunk matches Expo's 100-message batch limit so no oversized payloads
    are ever built in memory.
    """

    CHUNK = 100
    db = SessionLocal()
    try:
        offset = 0
        total = 0
        while True:
            tokens = [
                pt.token for pt in db.query(PushToken.token)
                .order_by(PushToken.id)
                .offset(offset)
                .limit(CHUNK)
                .all()
            ]
            if not tokens:
                break
            await broadcast_maintenance_update(
                tokens=tokens,
                maintenance=maintenance,
                message=message,
            )
            total += len(tokens)
            if len(tokens) < CHUNK:
                break
            offset += CHUNK
        logger.info(f"Broadcast maintenance={maintenance} to {total} devices")
    except Exception as e:
        logger.error(f"Error broadcasting maintenance update: {e}")
    finally:
        db.close()


router = APIRouter(prefix="/app", tags=["app"])


class AppStatusResponse(BaseModel):
    maintenance: bool
    message: str


class SetMaintenanceRequest(BaseModel):
    maintenance: bool
    message: str = ""


@router.get("/status", response_model=AppStatusResponse)
def get_app_status(db: Session = Depends(get_db)):
    """
    Check if the app is in maintenance mode.
    No authentication required — called on foreground.
    """
    try:
        # Query the maintenance_mode flag from app_admin table
        maintenance_record = db.query(AppAdmin).filter(
            AppAdmin.key == "maintenance_mode"
        ).first()

        if not maintenance_record:
            # If record doesn't exist, assume app is operational
            logger.warning("maintenance_mode record not found in app_admin table")
            return AppStatusResponse(maintenance=False, message="")

        message = maintenance_record.message or ""
        return AppStatusResponse(
            maintenance=maintenance_record.value,
            message=message
        )
    except Exception as e:
        logger.error(f"Error checking app status: {e}")
        # Fail open — assume app is operational if we can't read the status
        return AppStatusResponse(maintenance=False, message="")


@router.put("/maintenance", response_model=AppStatusResponse)
def set_maintenance_mode(
    req: SetMaintenanceRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _user=Depends(get_admin_user),
):
    """
    Toggle maintenance mode and broadcast a silent push to all devices.
    Requires authentication (admin use).
    """
    record = db.query(AppAdmin).filter(AppAdmin.key == "maintenance_mode").first()
    if not record:
        raise HTTPException(status_code=404, detail="maintenance_mode record not found")

    record.value = req.maintenance
    record.message = req.message
    db.commit()
    db.refresh(record)

    log_audit(db, action="maintenance_toggle", request=request, user_id=_user.id, detail={"maintenance": req.maintenance, "message": req.message})

    # Schedule broadcast without loading the entire push_tokens table into
    # request memory.  The background task opens its own session and pages
    # through tokens in 100-item chunks matching Expo's batch limit.
    background_tasks.add_task(
        _broadcast_maintenance_background,
        maintenance=req.maintenance,
        message=req.message,
    )
    logger.info(f"Scheduled maintenance broadcast: maintenance={req.maintenance}")

    return AppStatusResponse(
        maintenance=record.value,
        message=record.message or "",
    )


# ── App Lifecycle ────────────────────────────────────────────────────────────

class AppLifecycleRequest(BaseModel):
    state: str  # "foreground" or "background"


@router.post("/lifecycle", status_code=204)
def report_lifecycle(
    payload: AppLifecycleRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Report app foreground/background transitions for audit trail."""
    action = f"app_{payload.state}" if payload.state in ("foreground", "background") else None
    if not action:
        return
    log_audit(db, action=action, request=request, user_id=current_user.id)

